import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EventLog, readRunEvents, summarizeRuns } from "./event-log.ts";
import type { AgentEvent, AssistantMessage } from "./types.ts";

const dirs: string[] = [];
function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "tju-eventlog-"));
	dirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function userStart(n: number): AgentEvent {
	return { type: "message_start", message: { role: "user", content: `m${n}`, timestamp: n } };
}

/**
 * `finalize()` used to `await this.flush()` once, but a flush that is already in
 * flight returns its own promise without splicing entries appended afterwards,
 * so the final message_end / turn_end / agent_end could be written to the meta
 * sidecar yet never reach the jsonl (confirmed in the wild on run
 * 1791734877940-112e58). The tail must be fully drained before meta is written.
 */
describe("EventLog finalize", () => {
	it("persists events appended while a flush is in flight", async () => {
		const dir = tempDir();
		const log = await EventLog.create({ dir, runId: "1791734877940-112e58", model: "m" });
		log.append(userStart(1));
		const inFlight = log.flush();
		log.append(userStart(2));
		log.append(userStart(3));

		await log.finalize();
		await inFlight.catch(() => {});

		const entries = await readRunEvents(dir, log.runId);
		expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
	});

	it("records the terminal message_end / turn_end / agent_end in the jsonl", async () => {
		const dir = tempDir();
		const log = await EventLog.create({ dir, runId: "run-tail", model: "m" });
		log.append(userStart(1));
		await log.flush();
		log.append({ type: "message_end", message: { role: "user", content: "m1", timestamp: 1 } });
		log.append({ type: "turn_start" });
		log.append({ type: "turn_end", message: { role: "assistant", content: [], api: "openai-completions", provider: "p", model: "m", usage: { input: 0, output: 0, totalTokens: 0 }, stopReason: "stop", timestamp: 2 }, toolResults: [] });
		log.append({ type: "agent_end", messages: [] });

		const meta = await log.finalize();
		const types = (await readRunEvents(dir, log.runId)).map((e) => e.event.type);
		expect(types).toContain("message_end");
		expect(types).toContain("turn_end");
		expect(types).toContain("agent_end");
		expect(meta.messageCount).toBe(1);
		expect(meta.endTs).not.toBeNull();
	});
});

const assistantEnd = (ts: number): AssistantMessage => ({
	role: "assistant",
	content: [],
	api: "openai-completions",
	provider: "p",
	model: "m",
	usage: { input: 0, output: 0, totalTokens: 0 },
	stopReason: "stop",
	timestamp: ts,
});

describe("summarizeRuns", () => {
	it("derives segments and counts for a run with no meta sidecar", async () => {
		const dir = tempDir();
		const log = await EventLog.create({ dir, runId: "run-nometa", model: "m" });
		log.append({ type: "turn_start" });
		log.append({ type: "message_start", message: assistantEnd(1) });
		log.append({ type: "message_end", message: assistantEnd(1) });
		await log.finalize();
		// Exercise the derive path: no sidecar metadata available.
		rmSync(join(dir, "run-nometa.meta.json"));

		const run = (await summarizeRuns(dir)).find((r) => r.runId === "run-nometa")!;

		expect(run.turnCount).toBe(1);
		expect(run.messageCount).toBe(1);
		expect(run.segments).toHaveLength(1);
	});

	it("reuses a run's summary until its files actually change", async () => {
		const dir = tempDir();
		const runId = "run-cache";
		const path = join(dir, `${runId}.jsonl`);
		const lines = [
			{ seq: 1, ts: 1000, runId, event: { type: "message_start", message: assistantEnd(1000) } },
			{ seq: 2, ts: 1010, runId, event: { type: "message_end", message: assistantEnd(1000) } },
		];
		writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf-8");

		const first = (await summarizeRuns(dir)).find((r) => r.runId === runId)!;
		const second = (await summarizeRuns(dir)).find((r) => r.runId === runId)!;
		// A cache hit yields the identical object; a rebuild would return a new one.
		expect(second).toBe(first);

		appendFileSync(
			path,
			JSON.stringify({ seq: 3, ts: 1020, runId, event: { type: "tool_start", toolCallId: "t1", toolName: "read", args: {} } }) + "\n",
		);
		const third = (await summarizeRuns(dir)).find((r) => r.runId === runId)!;

		expect(third).not.toBe(first);
		expect(third.toolCount).toBe(1);
	});
});
