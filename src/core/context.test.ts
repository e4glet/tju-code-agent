import { describe, expect, it } from "vitest";
import { CHECKPOINT_PREFIX, extractKeptUserMessages, serializeMessage, transcriptTokens } from "./context.ts";
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
