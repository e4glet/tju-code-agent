import { describe, expect, it } from "vitest";
import { CHECKPOINT_PREFIX, extractKeptUserMessages } from "./context.ts";
import { TURN_CAP_MARKER } from "./agent-loop.ts";
import type { Message } from "./types.ts";

function user(content: string): Message {
	return { role: "user", content, timestamp: 1 };
}

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
