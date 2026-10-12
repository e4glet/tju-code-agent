import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { openaiCompletions } from "./openai.ts";
import { anthropicMessages } from "./anthropic.ts";
import type { Context, GroundEvent } from "./types.ts";
import type { Attachment, AssistantMessage, Message, UserMessage } from "../core/types.ts";

interface RecordedRequest {
	body: any;
}

function startFakeOpenAi(recorded: RecordedRequest[], failFirstWith413: boolean): Promise<{ server: Server; port: number }> {
	let count = 0;
	const server = createServer((req, res) => {
		let raw = "";
		req.on("data", (chunk) => {
			raw += chunk;
		});
		req.on("end", () => {
			count++;
			try {
				recorded.push({ body: JSON.parse(raw) });
			} catch {
				recorded.push({ body: null });
			}
			if (failFirstWith413 && count === 1) {
				res.writeHead(413, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: { message: "request body too large" } }));
				return;
			}
			res.writeHead(200, { "content-type": "text/event-stream" });
			res.write(
				`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 50, completion_tokens: 1 } })}\n\n`,
			);
			res.write("data: [DONE]\n\n");
			res.end();
		});
	});
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			resolve({ server, port });
		});
	});
}

const servers: Server[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.close();
});

function image(id: string, name: string, size: number): Attachment {
	return { id, name, mime: "image/png", size, kind: "image" };
}

function user(text: string, attachments: Attachment[], timestamp: number): UserMessage {
	return { role: "user", content: text, attachments, timestamp };
}

/** A realistic write call: the argument JSON carries a whole file body. */
function writeCall(id: string, body: string, timestamp: number): AssistantMessage {
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

function toolResult(id: string, content: string, timestamp: number): Message {
	return { role: "toolResult", toolCallId: id, toolName: "write", content, isError: false, timestamp };
}

/** 40 write/edit turns, each with a whole-file body: the shape that blew up. */
function longTranscript(): Message[] {
	const messages: Message[] = [{ role: "user", content: "build the thing", timestamp: 0 }];
	for (let i = 0; i < 40; i++) {
		messages.push(writeCall(`t${i}`, "Z".repeat(30_000), i * 2 + 1));
		messages.push(toolResult(`t${i}`, `wrote t${i}.ts (${30_000} bytes)`, i * 2 + 2));
	}
	return messages;
}

const resolveAttachment = async (): Promise<Uint8Array> => new Uint8Array([1, 2, 3, 4]);

function imageContext(): Context {
	return {
		systemPrompt: "",
		messages: [user("old", [image("a", "a-old.png", 600_000)], 1), user("new", [image("b", "b-new.png", 600_000)], 2)],
		resolveAttachment,
	};
}

async function run(
	context: Context,
	maxImageBytes: number | undefined,
	failFirstWith413: boolean,
): Promise<{ recorded: RecordedRequest[]; events: GroundEvent[] }> {
	const recorded: RecordedRequest[] = [];
	const { server, port } = await startFakeOpenAi(recorded, failFirstWith413);
	servers.push(server);
	const events = await openaiCompletions.stream(
		{ id: "test-model", provider: "test", baseUrl: `http://127.0.0.1:${port}` },
		context,
		{ apiKey: "test-key", maxImageBytes },
	);
	const drained: GroundEvent[] = [];
	for await (const event of events) drained.push(event);
	return { recorded, events: drained };
}

describe("openai image budget", () => {
	it("omits the oldest image past the budget and keeps the newest", async () => {
		const { recorded, events } = await run(imageContext(), 1_000_000, false);
		expect(recorded).toHaveLength(1);
		const messages = recorded[0]!.body.messages;
		expect(typeof messages[0].content).toBe("string");
		expect(messages[0].content).toContain("a-old.png");
		const blocks = messages[1].content as Array<{ type?: string }>;
		expect(blocks.some((b) => b.type === "image_url")).toBe(true);
		expect(events.some((e) => e.type === "done")).toBe(true);
	});

	it("halves the budget and retries after a 413, then reports success", async () => {
		const { recorded, events } = await run(imageContext(), 1_000_000, true);
		expect(recorded).toHaveLength(2);
		const second = recorded[1]!.body.messages;
		const hasImage = (content: unknown): boolean =>
			Array.isArray(content) && content.some((b) => (b as { type?: string }).type === "image_url");
		expect(hasImage(second[0].content)).toBe(false);
		expect(hasImage(second[1].content)).toBe(false);
		expect(second[1].content).toContain("b-new.png");
		const done = events.find((e) => e.type === "done");
		expect(done?.type).toBe("done");
	});

	it("fails fast without sending when text alone exceeds the budget", async () => {
		const context: Context = {
			systemPrompt: "",
			messages: [{ role: "user", content: `big ${"x".repeat(6_000_000)}`, timestamp: 1 }],
			resolveAttachment,
		};
		const { recorded, events } = await run(context, 1000, false);
		expect(recorded).toHaveLength(0);
		const error = events.find((e) => e.type === "error");
		expect(error?.type).toBe("error");
		if (error?.type === "error") expect(error.message.errorMessage).toContain("413");
	});
});

describe("openai tool budget (real request body)", () => {
	it("shrinks an old write-heavy transcript and keeps every call paired", async () => {
		const context: Context = { systemPrompt: "", messages: longTranscript(), resolveAttachment };
		const { recorded, events } = await run(context, undefined, false);
		expect(recorded).toHaveLength(1);
		expect(events.some((e) => e.type === "done")).toBe(true);

		const messages = recorded[0]!.body.messages as Array<Record<string, any>>;
		const raw = JSON.stringify(messages);

		// 40 turns * 30k chars would be ~1.2M chars of arguments alone.
		expect(raw.length).toBeLessThan(400_000);

		// Pairing intact: every tool_calls id has exactly one tool message after it.
		const callIds: string[] = [];
		for (const m of messages) {
			for (const tc of m.tool_calls ?? []) callIds.push(tc.id);
		}
		const resultIds = messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id);
		expect(resultIds).toEqual(callIds);
		expect(callIds).toHaveLength(40);

		// Names survive; only the payload is reduced.
		for (const m of messages) {
			for (const tc of m.tool_calls ?? []) expect(tc.function.name).toBe("write");
		}

		// The oldest calls lost their body, the newest kept it.
		const first = messages.find((m) => (m.tool_calls ?? []).length > 0)!;
		expect(first.tool_calls[0].function.arguments.length).toBeLessThan(1_000);
		const last = [...messages].reverse().find((m) => (m.tool_calls ?? []).length > 0)!;
		expect(last.tool_calls[0].function.arguments.length).toBeGreaterThan(25_000);

		// Old results were replaced by the placeholder.
		expect(raw).toContain("[Old tool result content cleared]");
	});

	it("leaves a short transcript untouched", async () => {
		const messages: Message[] = [
			{ role: "user", content: "hi", timestamp: 0 },
			writeCall("t0", "small body", 1),
			toolResult("t0", "ok", 2),
		];
		const context: Context = { systemPrompt: "", messages, resolveAttachment };
		const { recorded } = await run(context, undefined, false);
		const sent = recorded[0]!.body.messages as Array<Record<string, any>>;
		expect(sent[1]!.tool_calls[0].function.arguments).toContain("small body");
		expect(sent[2]!.content).toBe("ok");
	});
});

describe("anthropic tool budget (real request body)", () => {
	it("shrinks old arguments while keeping tool_use ids paired with tool_result", async () => {
		const recorded: RecordedRequest[] = [];
		const { server, port } = await startFakeOpenAi(recorded, false);
		servers.push(server);
		const context: Context = { systemPrompt: "", messages: longTranscript(), resolveAttachment };
		const events = await anthropicMessages.stream(
			{ id: "test-model", provider: "test", baseUrl: `http://127.0.0.1:${port}` },
			context,
			{ apiKey: "test-key" },
		);
		for await (const _ of events) {
			// drain
		}
		const messages = recorded[0]!.body.messages as Array<Record<string, any>>;
		const raw = JSON.stringify(messages);
		expect(raw.length).toBeLessThan(400_000);

		const useIds: string[] = [];
		const resultIds: string[] = [];
		for (const m of messages) {
			for (const block of m.content ?? []) {
				if (block.type === "tool_use") useIds.push(block.id);
				if (block.type === "tool_result") resultIds.push(block.tool_use_id);
			}
		}
		expect(useIds).toHaveLength(40);
		expect(resultIds).toEqual(useIds);
		expect(raw).toContain("[Old tool result content cleared]");
	});
});
