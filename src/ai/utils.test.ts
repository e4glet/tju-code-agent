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

	it("pins fresh read results while aging out model-authored payload", () => {
		const readCall: Message = {
			role: "assistant",
			content: [{ type: "toolCall", id: "rd", name: "read", arguments: { path: "a.ts" } }],
			api: "openai-completions",
			provider: "openai",
			model: "m",
			usage: { input: 0, output: 0, totalTokens: 0 },
			stopReason: "tool",
			timestamp: 1,
		};
		const readRes: Message = {
			role: "toolResult",
			toolCallId: "rd",
			toolName: "read",
			content: "FILE-A-BODY",
			isError: false,
			timestamp: 2,
			details: { path: "a.ts" },
		};
		const messages: Message[] = [readCall, readRes];
		for (let i = 0; i < 20; i++) {
			messages.push(call(`w${i}`, "Z".repeat(20_000), 10 + i * 2));
			messages.push(result(`w${i}`, "R".repeat(5_000), 11 + i * 2));
		}
		const out = applyToolBudget(messages);
		const kept = out.messages.find((m) => m.role === "toolResult" && m.toolCallId === "rd");
		// The read is the only copy of that file's content the model has, so it
		// must survive; the model-authored write bodies may still be trimmed.
		expect(kept?.role === "toolResult" ? kept.content : "").toBe("FILE-A-BODY");
		expect(out.trimmedCalls).toBeGreaterThan(0);
	});

	it("does not pin a read result whose file was written since", () => {
		const readCall: Message = {
			role: "assistant",
			content: [{ type: "toolCall", id: "rd", name: "read", arguments: { path: "a.ts" } }],
			api: "openai-completions",
			provider: "openai",
			model: "m",
			usage: { input: 0, output: 0, totalTokens: 0 },
			stopReason: "tool",
			timestamp: 1,
		};
		const readRes: Message = {
			role: "toolResult",
			toolCallId: "rd",
			toolName: "read",
			content: "STALE-BODY",
			isError: false,
			timestamp: 2,
			details: { path: "a.ts" },
		};
		const messages: Message[] = [readCall, readRes, call("a", "Z".repeat(20_000), 3), result("a", "wrote", 4)];
		for (let i = 0; i < 20; i++) {
			messages.push(call(`w${i}`, "Z".repeat(20_000), 10 + i * 2));
			messages.push(result(`w${i}`, "R".repeat(5_000), 11 + i * 2));
		}
		const out = applyToolBudget(messages);
		const got = out.messages.find((m) => m.role === "toolResult" && m.toolCallId === "rd");
		// Showing the pre-edit body would be worse than a tombstone.
		expect(got?.role === "toolResult" ? got.content : "").toContain("[Old tool result cleared:");
	});

	it("pins at most one body per path so re-reading one file cannot evict another", () => {
		// A model that re-reads a.ts must not push b.ts out of the pinned set.
		const readCall = (id: string, path: string, ts: number): Message => ({
			role: "assistant",
			content: [{ type: "toolCall", id, name: "read", arguments: { path } }],
			api: "openai-completions",
			provider: "openai",
			model: "m",
			usage: { input: 0, output: 0, totalTokens: 0 },
			stopReason: "tool",
			timestamp: ts,
		});
		const readRes = (id: string, path: string, body: string, ts: number): Message => ({
			role: "toolResult",
			toolCallId: id,
			toolName: "read",
			content: body,
			isError: false,
			timestamp: ts,
			details: { path },
		});
		const messages: Message[] = [
			readCall("a1", "a.ts", 1),
			readRes("a1", "a.ts", "BODY-A-1", 2),
			readCall("b1", "b.ts", 3),
			readRes("b1", "b.ts", "BODY-B-1", 4),
		];
		// Six more whole reads of a.ts, each large enough to fill the window alone.
		for (let i = 0; i < 6; i++) {
			messages.push(readCall(`a${i + 2}`, "a.ts", 10 + i * 2));
			messages.push(readRes(`a${i + 2}`, "a.ts", `BODY-A-${i + 2}-${"Z".repeat(30_000)}`, 11 + i * 2));
		}
		const out = applyToolBudget(messages);
		const kept = out.messages.find((m) => m.role === "toolResult" && m.toolCallId === "b1");
		expect(kept?.role === "toolResult" ? kept.content : "").toBe("BODY-B-1");
	});

	it("keeps two files that share a basename in different directories", () => {
		// Comparing an upstream copy with a local copy is the case that breaks
		// basename identity: each read would evict the other's pinned body.
		const readCall = (id: string, path: string, ts: number): Message => ({
			role: "assistant",
			content: [{ type: "toolCall", id, name: "read", arguments: { path } }],
			api: "openai-completions",
			provider: "openai",
			model: "m",
			usage: { input: 0, output: 0, totalTokens: 0 },
			stopReason: "tool",
			timestamp: ts,
		});
		const readRes = (id: string, path: string, body: string, ts: number, range?: [number, number]): Message => ({
			role: "toolResult",
			toolCallId: id,
			toolName: "read",
			content: body,
			isError: false,
			timestamp: ts,
			details: range ? { path, startLine: range[0], endLine: range[1] } : { path },
		});
		const upstream = "D:\\github\\dsh-our-free-model\\src\\upstream.js";
		const local = "D:\\AI_projects\\our-free-model\\src\\upstream.js";
		const messages: Message[] = [
			readCall("u1", upstream, 1),
			readRes("u1", upstream, "UPSTREAM-BODY", 2),
			call("filler", "Z".repeat(20_000), 3),
			result("filler", "wrote", 4),
			readCall("l1", local, 5),
			readRes("l1", local, "LOCAL-BODY", 6),
		];
		for (let i = 0; i < 12; i++) {
			messages.push(call(`w${i}`, "Z".repeat(20_000), 10 + i * 2));
			messages.push(result(`w${i}`, "R".repeat(5_000), 11 + i * 2));
		}
		const out = applyToolBudget(messages);
		const body = (id: string) => {
			const m = out.messages.find((x) => x.role === "toolResult" && x.toolCallId === id);
			return m?.role === "toolResult" ? m.content : "";
		};
		expect(body("u1")).toBe("UPSTREAM-BODY");
		expect(body("l1")).toBe("LOCAL-BODY");

		// Two disjoint slices of one file are two facts, not one.
		const sliced: Message[] = [
			readCall("s1", local, 1),
			readRes("s1", local, "LOCAL-HEAD", 2, [1, 140]),
			readCall("s2", local, 3),
			readRes("s2", local, "LOCAL-TAIL", 4, [140, 322]),
		];
		for (let i = 0; i < 12; i++) {
			sliced.push(call(`t${i}`, "Z".repeat(20_000), 10 + i * 2));
			sliced.push(result(`t${i}`, "R".repeat(5_000), 11 + i * 2));
		}
		const slicedOut = applyToolBudget(sliced);
		const slice = (id: string) => {
			const m = slicedOut.messages.find((x) => x.role === "toolResult" && x.toolCallId === id);
			return m?.role === "toolResult" ? m.content : "";
		};
		expect(slice("s1")).toBe("LOCAL-HEAD");
		expect(slice("s2")).toBe("LOCAL-TAIL");
	});

	it("does not call a read stale when a different same-named file was written", () => {
		const readCall = (id: string, path: string, ts: number): Message => ({
			role: "assistant",
			content: [{ type: "toolCall", id, name: "read", arguments: { path } }],
			api: "openai-completions",
			provider: "openai",
			model: "m",
			usage: { input: 0, output: 0, totalTokens: 0 },
			stopReason: "tool",
			timestamp: ts,
		});
		const upstream = "D:\\github\\dsh-our-free-model\\src\\upstream.js";
		const local = "D:\\AI_projects\\our-free-model\\src\\upstream.js";
		const messages: Message[] = [
			readCall("u1", upstream, 1),
			{ role: "toolResult", toolCallId: "u1", toolName: "read", content: "UPSTREAM-BODY", isError: false, timestamp: 2, details: { path: upstream } },
			{
				role: "assistant",
				content: [{ type: "toolCall", id: "e1", name: "edit", arguments: { path: local, oldString: "a", newString: "b" } }],
				api: "openai-completions",
				provider: "openai",
				model: "m",
				usage: { input: 0, output: 0, totalTokens: 0 },
				stopReason: "tool",
				timestamp: 3,
			},
			{ role: "toolResult", toolCallId: "e1", toolName: "edit", content: "edited", isError: false, timestamp: 4 },
		];
		for (let i = 0; i < 12; i++) {
			messages.push(call(`w${i}`, "Z".repeat(20_000), 10 + i * 2));
			messages.push(result(`w${i}`, "R".repeat(5_000), 11 + i * 2));
		}
		const out = applyToolBudget(messages);
		const got = out.messages.find((m) => m.role === "toolResult" && m.toolCallId === "u1");
		expect(got?.role === "toolResult" ? got.content : "").toBe("UPSTREAM-BODY");
	});

	it("still calls a read stale when a relative write names the same file", () => {
		const path = "D:\\AI_projects\\our-free-model\\src\\upstream.js";
		const messages: Message[] = [
			{
				role: "assistant",
				content: [{ type: "toolCall", id: "r1", name: "read", arguments: { path } }],
				api: "openai-completions",
				provider: "openai",
				model: "m",
				usage: { input: 0, output: 0, totalTokens: 0 },
				stopReason: "tool",
				timestamp: 1,
			},
			{ role: "toolResult", toolCallId: "r1", toolName: "read", content: "STALE-BODY", isError: false, timestamp: 2, details: { path } },
			{
				role: "assistant",
				content: [{ type: "toolCall", id: "w1", name: "write", arguments: { path: "src/upstream.js", content: "new" } }],
				api: "openai-completions",
				provider: "openai",
				model: "m",
				usage: { input: 0, output: 0, totalTokens: 0 },
				stopReason: "tool",
				timestamp: 3,
			},
			{ role: "toolResult", toolCallId: "w1", toolName: "write", content: "wrote", isError: false, timestamp: 4 },
		];
		for (let i = 0; i < 12; i++) {
			messages.push(call(`w${i}`, "Z".repeat(20_000), 10 + i * 2));
			messages.push(result(`w${i}`, "R".repeat(5_000), 11 + i * 2));
		}
		const out = applyToolBudget(messages);
		const got = out.messages.find((m) => m.role === "toolResult" && m.toolCallId === "r1");
		expect(got?.role === "toolResult" ? got.content : "").toContain("[Old tool result cleared:");
	});

	it("never mutates the input messages", () => {
		const messages: Message[] = [{ role: "user", content: "go", timestamp: 0 }];
		for (let i = 0; i < 20; i++) messages.push(call(`t${i}`, "Z".repeat(20_000), i * 2 + 1));
		const snapshot = JSON.stringify(messages);
		applyToolBudget(messages);
		expect(JSON.stringify(messages)).toBe(snapshot);
	});

	it("replaces cleared results with a tombstone naming tool, path and size", () => {
		const messages: Message[] = [{ role: "user", content: "go", timestamp: 0 }];
		for (let i = 0; i < 20; i++) {
			messages.push(call(`t${i}`, "Z".repeat(20_000), i * 2 + 1));
			messages.push(result(`t${i}`, "R".repeat(5_000), i * 2 + 2));
		}
		const out = applyToolBudget(messages);
		const cleared = out.messages.filter(
			(m): m is Extract<Message, { role: "toolResult" }> => m.role === "toolResult" && m.content.startsWith("[Old tool result cleared:"),
		);
		expect(cleared.length).toBeGreaterThan(0);
		expect(cleared[0]?.content).toContain("write t0.ts");
		expect(cleared[0]?.content).toMatch(/\(\d+\.\dKB\)/);
	});

	it("keeps only the newest todowrite result verbatim", () => {
		function todoCall(id: string, timestamp: number): Message {
			return {
				role: "assistant",
				content: [{ type: "toolCall", id, name: "todowrite", arguments: { todos: [{ content: "a", status: "active" }] } }],
				api: "openai-completions",
				provider: "openai",
				model: "m",
				usage: { input: 0, output: 0, totalTokens: 0 },
				stopReason: "tool",
				timestamp,
			};
		}
		function todoResult(id: string, content: string, timestamp: number): Message {
			return { role: "toolResult", toolCallId: id, toolName: "todowrite", content, isError: false, timestamp };
		}
		const messages: Message[] = [{ role: "user", content: "go", timestamp: 0 }];
		messages.push(todoCall("old-todo", 1), todoResult("old-todo", "Todo list updated:\n- [ ] a", 2));
		messages.push(todoCall("new-todo", 3), todoResult("new-todo", "Todo list updated:\n- [x] a", 4));
		for (let i = 0; i < 20; i++) {
			messages.push(call(`t${i}`, "Z".repeat(20_000), 10 + i * 2));
			messages.push(result(`t${i}`, "R".repeat(5_000), 11 + i * 2));
		}
		const out = applyToolBudget(messages);
		const todos = out.messages.filter(
			(m): m is Extract<Message, { role: "toolResult" }> => m.role === "toolResult" && m.toolName === "todowrite",
		);
		expect(todos).toHaveLength(2);
		expect(todos[0]?.content).toContain("[Old tool result cleared: todowrite");
		expect(todos[1]?.content).toContain("- [x] a");
	});
});

