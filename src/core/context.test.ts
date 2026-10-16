import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { CHECKPOINT_PREFIX, compactTranscript, extractKeptUserMessages, pruneTranscript, serializeMessage, transcriptTokens } from "./context.ts";
import { TURN_CAP_MARKER } from "./agent-loop.ts";
import { estimateTokens } from "../ai/utils.ts";
import type { AssistantMessage, Message } from "./types.ts";

function user(content: string): Message {
	return { role: "user", content, timestamp: 1 };
}

function assistant(content: AssistantMessage["content"]): Message {
	return {
		role: "assistant",
		content,
		api: "openai-completions",
		provider: "openai",
		model: "m",
		usage: { input: 0, output: 0, totalTokens: 0 },
		stopReason: "stop",
		timestamp: 2,
	};
}

describe("transcriptTokens", () => {
	it("counts tool-call arguments, not just text and thinking", () => {
		// Regression: messageText only read text/thinking, so a write/edit call
		// carrying a whole file body added ~0 to the budget and the transcript
		// could blow past the context window with no compaction triggered.
		const body = "Z".repeat(4_000);
		const withCall = transcriptTokens([assistant([{ type: "toolCall", id: "t1", name: "write", arguments: { path: "x.ts", content: body } }])]);
		const argsTokens = estimateTokens(JSON.stringify({ path: "x.ts", content: body }));
		expect(withCall).toBeGreaterThanOrEqual(argsTokens);
	});

	it("counts tool results and assistant text as before", () => {
		expect(transcriptTokens([user("hello")])).toBe(estimateTokens("hello"));
		expect(
			transcriptTokens([
				{ role: "toolResult", toolCallId: "t1", toolName: "read", content: "abcd", isError: false, timestamp: 3 },
			]),
		).toBe(estimateTokens("abcd"));
	});

	it("still ignores an assistant turn that carries only an empty call", () => {
		// Arguments are serialized as-is; an empty object must not invent weight.
		expect(transcriptTokens([assistant([{ type: "toolCall", id: "t1", name: "todowrite", arguments: {} }])])).toBe(
			estimateTokens("todowrite({})"),
		);
	});
});

describe("serializeMessage", () => {
	it("caps tool-call arguments so the summary prompt cannot be blown up", () => {
		// Regression: a write/edit call carries a whole file body; a few hundred
		// of them made the summary request itself oversize, so compaction fell
		// back to dropping whole turns instead of summarizing.
		const body = "Z".repeat(40_000);
		const line = serializeMessage(assistant([{ type: "toolCall", id: "t1", name: "write", arguments: { path: "x.ts", content: body } }]));
		expect(line).toContain("[Assistant tool call]: write(");
		expect(line).toContain("[truncated]");
		expect(line.length).toBeLessThan(3_000);
	});

	it("caps tool results and keeps short ones verbatim", () => {
		const big = serializeMessage({ role: "toolResult", toolCallId: "t1", toolName: "read", content: "Z".repeat(5_000), isError: false, timestamp: 3 });
		expect(big).toContain("[truncated]");
		expect(big.length).toBeLessThan(3_000);

		const short = serializeMessage({ role: "toolResult", toolCallId: "t1", toolName: "read", content: "ok", isError: false, timestamp: 3 });
		expect(short).toBe("[Tool result]: ok");
	});

	it("leaves an ordinary user message untouched", () => {
		expect(serializeMessage(user("do the thing"))).toBe("[User]: do the thing");
	});
});

describe("extractKeptUserMessages", () => {
	it("keeps plain user messages in order", () => {
		const kept = extractKeptUserMessages([user("first task"), user("second task")]);
		expect(kept.map((m) => m.content)).toEqual(["first task", "second task"]);
	});
	it("drops checkpoints, legacy cap notices and non-user roles", () => {
		const kept = extractKeptUserMessages([
			user(`${CHECKPOINT_PREFIX}\nold summary`),
			user(`  ${TURN_CAP_MARKER}\nlegacy notice`),
			user("real requirement"),
			{
				role: "assistant",
				content: [],
				api: "openai-completions",
				provider: "openai",
				model: "m",
				usage: { input: 0, output: 0, totalTokens: 0 },
				stopReason: "stop",
				timestamp: 2,
			},
			{ role: "toolResult", toolCallId: "t1", toolName: "read", content: "x", isError: false, timestamp: 3 },
		]);
		expect(kept.map((m) => m.content)).toEqual(["real requirement"]);
	});
	it("skips non-string user content", () => {
		const kept = extractKeptUserMessages([{ role: "user", content: 42, timestamp: 1 } as unknown as Message]);
		expect(kept).toEqual([]);
	});
});

describe("compactTranscript", () => {
	const servers: Server[] = [];
	const bodies: string[] = [];
	afterEach(() => {
		for (const server of servers.splice(0)) server.close();
		bodies.length = 0;
	});

	function startSummaryProvider(): Promise<{ server: Server; port: number }> {
		const server = createServer((req, res) => {
			let raw = "";
			req.on("data", (chunk) => {
				raw += chunk;
			});
			req.on("end", () => {
				bodies.push(raw);
				res.writeHead(200, { "content-type": "text/event-stream" });
				res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "# Summary" } }] })}\n\n`);
				res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
				res.write("data: [DONE]\n\n");
				res.end();
			});
		});
		return new Promise((resolve) => {
			server.listen(0, "127.0.0.1", () => {
				const address = server.address();
				resolve({ server, port: typeof address === "object" && address ? address.port : 0 });
			});
		});
	}

	const modelFor = (port: number) => ({
		id: "m",
		api: "openai-completions" as const,
		provider: "fake",
		baseUrl: `http://127.0.0.1:${port}/v1`,
		thinking: false,
	});
	const options = (port: number, force = true) => ({
		model: modelFor(port),
		apiKey: "k",
		systemPrompt: "sys",
		tools: [],
		maxContextTokens: 30_000,
		force,
	});

	function longTranscript(): Message[] {
		const bulk = "Z".repeat(4_000);
		const messages: Message[] = [{ role: "user", content: "FIRST REQUIREMENT", timestamp: 1 }];
		for (let i = 0; i < 20; i++) messages.push(assistant([{ type: "text", text: bulk }]));
		messages.push({ role: "user", content: "LATEST REQUIREMENT", timestamp: 99 });
		return messages;
	}

	it("keeps a user message that falls inside the recent tail as a real message", async () => {
		const { server, port } = await startSummaryProvider();
		servers.push(server);
		const messages = longTranscript();

		const out = await compactTranscript(messages, options(port));

		expect(out).not.toBeNull();
		// Regression: the tail user message used to be folded into the checkpoint's
		// <recent-context> text and dropped as a message, so reverting to its bubble
		// failed with "Unknown message timestamp".
		const kept = out!.filter((m) => m.role === "user").map((m) => (m as { content: string }).content);
		expect(kept).toContain("LATEST REQUIREMENT");
		expect(kept).toContain("FIRST REQUIREMENT");
		expect(kept[0]!.startsWith(CHECKPOINT_PREFIX)).toBe(true);
	});

	it("inserts exactly one marker and never drops original messages", async () => {
		const { server, port } = await startSummaryProvider();
		servers.push(server);
		const messages = longTranscript();
		const original = messages.slice();

		const out = await compactTranscript(messages, options(port));

		expect(out).not.toBeNull();
		const markers = messages.filter((m) => m.role === "user" && m.compaction === true);
		expect(markers).toHaveLength(1);
		// Full separation: the transcript keeps every original message object and
		// only gains the marker.
		for (const m of original) expect(messages).toContain(m);
		expect(messages.length).toBe(original.length + 1);
		// The folded assistant turns stay in the transcript but leave the outbound.
		expect(messages).toContain(original[1]);
		expect(out).not.toContain(original[1]);
	});

	it("moves the marker forward and merges the prior summary", async () => {
		const { server, port } = await startSummaryProvider();
		servers.push(server);
		const messages = longTranscript();
		await compactTranscript(messages, options(port));
		const firstMarker = messages.find((m) => m.role === "user" && m.compaction === true);

		const bulk = "Z".repeat(4_000);
		for (let i = 0; i < 20; i++) messages.push(assistant([{ type: "text", text: bulk }]));
		messages.push({ role: "user", content: "THIRD REQUIREMENT", timestamp: 900 });
		const before = messages.length;

		const out = await compactTranscript(messages, options(port));

		const markers = messages.filter((m) => m.role === "user" && m.compaction === true);
		expect(markers).toHaveLength(1);
		expect(markers[0]).not.toBe(firstMarker);
		// Only the old marker was replaced; nothing else was removed.
		expect(messages.length).toBe(before);
		expect(out!.filter((m) => m.role === "user").map((m) => (m as { content: string }).content)).toContain("THIRD REQUIREMENT");
		// The second summarisation carried the previous summary forward.
		expect(bodies).toHaveLength(2);
		expect(bodies[1]).toContain("<prior-summary>");
	});

	it("treats a legacy <conversation-checkpoint> message as the boundary", async () => {
		const { server, port } = await startSummaryProvider();
		servers.push(server);
		const legacy: Message = {
			role: "user",
			content: `${CHECKPOINT_PREFIX}\n<summary>\nOLD\n</summary>\n</conversation-checkpoint>`,
			timestamp: 1,
		};
		const messages: Message[] = [legacy, { role: "user", content: "REQ", timestamp: 2 }];

		const out = await compactTranscript(messages, options(port, false));

		// Within budget but a marker exists: derive the outbound, leave the
		// transcript untouched (no re-compaction).
		expect(out).not.toBeNull();
		expect(messages).toHaveLength(2);
		expect(out!).toHaveLength(2);
		expect(out![0]).toBe(legacy);
	});

	it("caps the folded region when pruneFoldedKeep is set (marker and live intact)", async () => {
		const { server, port } = await startSummaryProvider();
		servers.push(server);
		const messages = longTranscript();

		const out = await compactTranscript(messages, { ...options(port), pruneFoldedKeep: 3 });

		const markerIndex = messages.findIndex((m) => m.role === "user" && m.compaction === true);
		// Only the folded region is capped; the marker follows it and the live
		// region (ending in the latest user message) is untouched.
		expect(markerIndex).toBe(3);
		expect(out![0]).toBe(messages[markerIndex]);
		expect(out!.filter((m) => m.role === "user").map((m) => (m as { content: string }).content)).toContain("LATEST REQUIREMENT");
	});
});

describe("pruneTranscript", () => {
	const marker = (timestamp: number): Message => ({
		role: "user",
		content: `${CHECKPOINT_PREFIX}\n<summary>S</summary>\n</conversation-checkpoint>`,
		compaction: true,
		timestamp,
	});
	const u = (timestamp: number, content: string): Message => ({ role: "user", content, timestamp });

	it("does nothing without a marker", () => {
		const messages = [u(1, "a"), u(2, "b")];
		expect(pruneTranscript(messages, 1)).toBe(false);
		expect(messages).toHaveLength(2);
	});

	it("keeps the most recent folded messages and never the marker or live region", () => {
		const live1 = u(100, "live1");
		const live2 = u(101, "live2");
		const markerMsg = marker(50);
		const messages = [u(1, "old1"), u(2, "old2"), u(3, "old3"), markerMsg, live1, live2];

		expect(pruneTranscript(messages, 2)).toBe(true);
		expect(messages).toEqual([u(2, "old2"), u(3, "old3"), markerMsg, live1, live2]);
	});

	it("returns false when the folded region already fits", () => {
		const messages = [u(1, "a"), marker(50), u(100, "live")];
		expect(pruneTranscript(messages, 5)).toBe(false);
		expect(messages).toHaveLength(3);
	});
});
