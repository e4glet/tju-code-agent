import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import {
	dropReplayedDuplicates,
	enqueueFrame,
	isCoalesciblePayload,
	payloadSeq,
	shouldSuppressFrame,
	writeOrWait,
	type SseFrame,
	type SseQueueState,
} from "./server.ts";

const frame = (type: string, size = 10): SseFrame => ({
	json: `data: {"kind":"event","event":{"type":"${type}","pad":"${"x".repeat(size)}"}}\n\n`,
	coalescible: type === "message_update",
});

const emptyQueue = (): SseQueueState => ({ frames: [], bytes: 0 });

describe("isCoalesciblePayload", () => {
	it("marks only streaming deltas as droppable", () => {
		expect(isCoalesciblePayload({ kind: "event", event: { type: "message_update" } })).toBe(true);
		expect(isCoalesciblePayload({ kind: "event", event: { type: "message_end" } })).toBe(false);
		expect(isCoalesciblePayload({ kind: "event", event: { type: "agent_end" } })).toBe(false);
		expect(isCoalesciblePayload({ kind: "approval", request: {} })).toBe(false);
		expect(isCoalesciblePayload(null)).toBe(false);
	});

	it("does not treat a payload that merely quotes the string as droppable", () => {
		// A model could emit the literal text; coalescibility must come from the
		// frame's own structure, not from scanning its JSON.
		const quoted = { kind: "event", event: { type: "message_end", message: { content: [{ text: '"type":"message_update"' }] } } };
		expect(isCoalesciblePayload(quoted)).toBe(false);
	});
});

describe("enqueueFrame", () => {
	it("queues frames and tracks bytes while under the caps", () => {
		const q = emptyQueue();
		const a = frame("message_end");
		expect(enqueueFrame(q, a, 1000, 100)).toBe(true);
		expect(q.frames).toHaveLength(1);
		expect(q.bytes).toBe(a.json.length);
	});

	it("evicts coalescible frames to stay within the frame cap", () => {
		const q = emptyQueue();
		for (let i = 0; i < 5; i++) expect(enqueueFrame(q, frame("message_update"), 1_000_000, 5)).toBe(true);
		const essential = frame("message_end");
		expect(enqueueFrame(q, essential, 1_000_000, 5)).toBe(true);

		expect(q.frames).toHaveLength(5);
		expect(q.frames.at(-1)).toBe(essential);
		expect(q.frames.filter((f) => f.coalescible)).toHaveLength(4);
		expect(q.bytes).toBe(q.frames.reduce((n, f) => n + f.json.length, 0));
	});

	it("evicts by byte cap too", () => {
		const q = emptyQueue();
		const big = frame("message_update", 400);
		expect(enqueueFrame(q, big, 1000, 1000)).toBe(true);
		expect(enqueueFrame(q, big, 1000, 1000)).toBe(true);
		expect(enqueueFrame(q, big, 1000, 1000)).toBe(true);
		// Third push exceeds 1000 bytes -> the oldest coalescible frame goes.
		expect(q.frames).toHaveLength(2);
		expect(q.bytes).toBeLessThanOrEqual(1000);
	});

	it("refuses when the queue holds nothing droppable", () => {
		const q = emptyQueue();
		for (let i = 0; i < 3; i++) expect(enqueueFrame(q, frame("message_end"), 1_000_000, 3)).toBe(true);
		// Every queued frame is essential: the caller must drop the client.
		expect(enqueueFrame(q, frame("agent_end"), 1_000_000, 3)).toBe(false);
	});
});

function fakeRes(writes: boolean[]): { res: Pick<import("node:http").ServerResponse, "write" | "once">; em: EventEmitter } {
	const em = new EventEmitter();
	let i = 0;
	const res = {
		write: (_chunk: string) => (i < writes.length ? writes[i++]! : true),
		once: em.once.bind(em),
	};
	return { res: res as unknown as Pick<import("node:http").ServerResponse, "write" | "once">, em };
}

describe("writeOrWait", () => {
	it("resolves immediately when the write is accepted", async () => {
		const { res } = fakeRes([true]);
		await expect(writeOrWait(res, "a")).resolves.toBeUndefined();
	});

	it("waits for drain when the socket buffer is full", async () => {
		const { res, em } = fakeRes([false]);
		let settled = false;
		const p = writeOrWait(res, "a").then(() => {
			settled = true;
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(settled).toBe(false);
		em.emit("drain");
		await p;
		expect(settled).toBe(true);
	});
});

describe("live/replay dedupe", () => {
	it("reads the run-log sequence off an event payload", () => {
		expect(payloadSeq({ kind: "event", seq: 7, event: {} })).toBe(7);
		expect(payloadSeq({ kind: "works" })).toBeUndefined();
		expect(payloadSeq(null)).toBeUndefined();
	});

	it("drops only buffered live frames the replay already delivered", () => {
		const replayThrough = 3;
		expect(shouldSuppressFrame({ json: "", coalescible: false, seq: 1 }, replayThrough)).toBe(true);
		expect(shouldSuppressFrame({ json: "", coalescible: false, seq: 3 }, replayThrough)).toBe(true);
		// Newer than the replay snapshot: must still be delivered.
		expect(shouldSuppressFrame({ json: "", coalescible: false, seq: 4 }, replayThrough)).toBe(false);
		// No sequence (state / works / approval): never suppressed.
		expect(shouldSuppressFrame({ json: "", coalescible: false }, replayThrough)).toBe(false);
	});

	it("keeps the frames a reconnect would otherwise have lost", () => {
		// Simulates a client that registered before the replay: live frames 1..3
		// overlap the replayed range and are dropped; 4..5 are newer and survive.
		const buffered: SseFrame[] = [1, 2, 3, 4, 5].map((seq) => ({ json: `data:{}`, coalescible: false, seq }));
		const delivered = buffered.filter((f) => !shouldSuppressFrame(f, 3)).map((f) => f.seq);
		expect(delivered).toEqual([4, 5]);
	});

	it("does not carry the replay watermark into the next run", () => {
		const q = emptyQueue();
		for (const seq of [1, 2, 3, 4, 5]) enqueueFrame(q, { json: "x".repeat(5), coalescible: false, seq }, 1_000_000, 1000);
		dropReplayedDuplicates(q, 3);
		expect(q.frames.map((f) => f.seq)).toEqual([4, 5]);
		expect(q.bytes).toBe(q.frames.reduce((n, f) => n + f.json.length, 0));

		// The next run restarts its sequence at 1; nothing filters it any more.
		enqueueFrame(q, { json: "y", coalescible: false, seq: 1 }, 1_000_000, 1000);
		expect(q.frames.map((f) => f.seq)).toEqual([4, 5, 1]);
	});
});
