import { describe, expect, it } from "vitest";
import { applyImageBudget, applyToolBudget, DEFAULT_MAX_IMAGE_BYTES, describeOversizeBody, estimateTokens } from "./utils.ts";
import type { Attachment, Message, UserMessage } from "../core/types.ts";

function image(id: string, name: string, size: number): Attachment {
	return { id, name, mime: "image/png", size, kind: "image" };
}

function user(text: string, attachments: Attachment[], timestamp: number): UserMessage {
	return { role: "user", content: text, attachments, timestamp };
}

describe("applyImageBudget", () => {
	it("leaves messages untouched when nothing can exceed the budget", () => {
		const messages: Message[] = [user("hi", [image("a", "a.png", 1000)], 1)];
		const result = applyImageBudget(messages, DEFAULT_MAX_IMAGE_BYTES);
		expect(result.evicted).toBe(0);
		expect(result.messages).toBe(messages);
	});

	it("returns the same array when no images are attached", () => {
		const messages: Message[] = [{ role: "user", content: "hi", timestamp: 1 }];
		const result = applyImageBudget(messages, 10);
		expect(result.evicted).toBe(0);
		expect(result.messages).toBe(messages);
	});

	it("evicts the oldest images first and keeps the newest within budget", () => {
		const messages: Message[] = [user("old", [image("a", "a-old.png", 600_000)], 1), user("new", [image("b", "b-new.png", 600_000)], 2)];
		const result = applyImageBudget(messages, 1_000_000);
		expect(result.evicted).toBe(1);
		expect(result.messages).not.toBe(messages);
		const old = result.messages[0] as UserMessage;
		expect(old.attachments).toBeUndefined();
		expect(old.content).toContain("old");
		expect(old.content).toContain("a-old.png");
		const fresh = result.messages[1] as UserMessage;
		expect(fresh.attachments).toHaveLength(1);
		expect(fresh.content).toBe("new");
		expect(messages[0]?.role === "user" ? (messages[0] as UserMessage).attachments : []).toHaveLength(1);
	});

	it("omits a single image larger than the whole budget but keeps the text", () => {
		const messages: Message[] = [user("look", [image("a", "huge.png", 50_000_000)], 1)];
		const result = applyImageBudget(messages, 1_000_000);
		expect(result.evicted).toBe(1);
		const only = result.messages[0] as UserMessage;
		expect(only.attachments).toBeUndefined();
		expect(only.content).toContain("look");
		expect(only.content).toContain("huge.png");
	});

	it("evicts images with unknown size before measurable ones", () => {
		const unknown = { id: "u", name: "mystery.png", mime: "image/png", kind: "image" } as Attachment;
		const messages: Message[] = [user("old", [unknown], 1), user("new", [image("b", "small.png", 1000)], 2)];
		const result = applyImageBudget(messages, 1_000_000);
		expect(result.evicted).toBe(1);
		expect((result.messages[0] as UserMessage).attachments).toBeUndefined();
		expect((result.messages[1] as UserMessage).attachments).toHaveLength(1);
	});

	it("falls back to the default budget for non-positive values", () => {
		const messages: Message[] = [user("hi", [image("a", "a.png", 1000)], 1)];
		expect(applyImageBudget(messages, 0).messages).toBe(messages);
		expect(applyImageBudget(messages, Number.NaN).messages).toBe(messages);
	});
});

describe("describeOversizeBody", () => {
	it("names the 413, the size and the recovery paths", () => {
		const text = describeOversizeBody(15_728_640, 6);
		expect(text).toContain("413");
		expect(text).toContain("15.0MB");
		expect(text).toContain("6");
		expect(text).toContain("--max-image-bytes");
	});
});

describe("estimateTokens", () => {
	it("keeps plain ASCII at four characters per token", () => {
		expect(estimateTokens("")).toBe(0);
		expect(estimateTokens("abcd")).toBe(1);
		expect(estimateTokens("abcdefgh")).toBe(2);
	});

	it("counts CJK characters at one token each", () => {
		expect(estimateTokens("你好世界")).toBe(4);
		expect(estimateTokens("hi你好")).toBe(3);
	});

	it("covers punctuation, kana, hangul and fullwidth forms", () => {
		expect(estimateTokens("。、あア한！")).toBe(6);
		expect(estimateTokens("　")).toBe(1);
	});
});

describe("applyToolBudget", () => {
	function call(id: string, body: string, timestamp: number): Message {
		return {
			role: "assistant",
			content: [{ type: "toolCall", id, name: "write", arguments: { path: `${id}.ts`, content: body } }],
			api: "openai-completions",
			provider: "openai",
			model: "m",
			usage: { input: 0, output: 0, totalTokens: 0 },
			stopReason: "tool",
			timestamp,
		};
	}
	function result(id: string, content: string, timestamp: number): Message {
		return { role: "toolResult", toolCallId: id, toolName: "write", content, isError: false, timestamp };
	}

	it("returns the same array when everything fits the window", () => {
		const messages: Message[] = [{ role: "user", content: "hi", timestamp: 0 }, call("t0", "tiny", 1), result("t0", "ok", 2)];
		const out = applyToolBudget(messages);
		expect(out.messages).toBe(messages);
		expect(out.trimmedCalls).toBe(0);
		expect(out.clearedResults).toBe(0);
	});

	it("clears old results and trims old arguments but keeps ids and names", () => {
		const messages: Message[] = [{ role: "user", content: "go", timestamp: 0 }];
		for (let i = 0; i < 20; i++) {
			messages.push(call(`t${i}`, "Z".repeat(20_000), i * 2 + 1));
			messages.push(result(`t${i}`, "wrote a lot", i * 2 + 2));
		}
		const out = applyToolBudget(messages);
		expect(out.messages).not.toBe(messages);
		expect(out.clearedResults).toBeGreaterThan(0);
		expect(out.trimmedCalls).toBeGreaterThan(0);

		const ids = out.messages.flatMap((m) => (m.role === "assistant" ? m.content.filter((c) => c.type === "toolCall").map((c) => c.id) : []));
		expect(ids).toEqual(messages.flatMap((m) => (m.role === "assistant" ? m.content.filter((c) => c.type === "toolCall").map((c) => c.id) : [])));

		// User message untouched.
		expect(out.messages[0]?.role === "user" ? out.messages[0].content : "").toBe("go");

		// Oldest call is trimmed, newest is verbatim.
		const first = out.messages.find((m) => m.role === "assistant")!;
		const firstCall = first.role === "assistant" ? first.content.find((c) => c.type === "toolCall") : undefined;
		expect(firstCall && firstCall.type === "toolCall" ? JSON.stringify(firstCall.arguments).length : 0).toBeLessThan(2_000);
	});

	it("never mutates the input messages", () => {
		const messages: Message[] = [{ role: "user", content: "go", timestamp: 0 }];
		for (let i = 0; i < 20; i++) messages.push(call(`t${i}`, "Z".repeat(20_000), i * 2 + 1));
		const snapshot = JSON.stringify(messages);
		applyToolBudget(messages);
		expect(JSON.stringify(messages)).toBe(snapshot);
	});
});

