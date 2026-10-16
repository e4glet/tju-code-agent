import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { runAgentLoop, TURN_CAP_MARKER } from "./agent-loop.ts";
import type { AgentContext, AgentEvent, AgentLoopConfig, AgentTool, Attachment, Model } from "./types.ts";

interface RecordedRequest {
	body: {
		messages?: Array<{ role: string; content?: unknown }>;
		tools?: unknown[];
	};
}

/**
 * Fake OpenAI-compatible provider: keeps answering with a tool call so the loop
 * never ends on its own, which is what makes the turn budget observable.
 */
function startFakeProvider(requests: RecordedRequest[], mode: { toolCall: boolean }): Promise<{ server: Server; port: number }> {
	const server = createServer((req, res) => {
		let raw = "";
		req.on("data", (chunk) => {
			raw += chunk;
		});
		req.on("end", () => {
			let body: RecordedRequest["body"] = {};
			try {
				body = JSON.parse(raw) as RecordedRequest["body"];
			} catch {
				body = {};
			}
			requests.push({ body });
			res.writeHead(200, { "content-type": "text/event-stream" });
			if (mode.toolCall && body.tools?.length) {
				res.write(
					`data: ${JSON.stringify({
						choices: [
							{
								delta: {
									tool_calls: [
										{ index: 0, id: "call_1", function: { name: "ping", arguments: "{}" } },
									],
								},
							},
						],
					})}\n\n`,
				);
				res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}\n\n`);
			} else {
				// Final text-only turn (tools are disabled by then).
				res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "summary of work" } }] })}\n\n`);
				res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
			}
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

const pingTool: AgentTool = {
	name: "ping",
	label: "ping",
	description: "no-op probe used by tests",
	parameters: z.object({}),
	execute: async () => ({ content: "pong" }),
};

async function run(options: {
	maxTurns: number;
	hasPendingWork?: () => boolean;
	afterTurn?: AgentLoopConfig["afterTurn"];
	getPlanAnchor?: () => string | undefined;
}): Promise<{ events: AgentEvent[]; context: AgentContext; requests: RecordedRequest[] }> {
	const requests: RecordedRequest[] = [];
	const { server, port } = await startFakeProvider(requests, { toolCall: true });
	servers.push(server);

	const model: Model = {
		id: "fake-model",
		api: "openai-completions",
		provider: "fake",
		baseUrl: `http://127.0.0.1:${port}/v1`,
		thinking: false,
	};
	const context: AgentContext = { systemPrompt: "test", messages: [], tools: [pingTool] };
	const config: AgentLoopConfig = {
		model,
		apiKey: "fake-key",
		tools: [pingTool],
		maxTurns: options.maxTurns,
		...(options.hasPendingWork ? { hasPendingWork: options.hasPendingWork } : {}),
		...(options.afterTurn ? { afterTurn: options.afterTurn } : {}),
		...(options.getPlanAnchor ? { getPlanAnchor: options.getPlanAnchor } : {}),
	};
	const events: AgentEvent[] = [];
	await runAgentLoop(["do work"], context, config, undefined, (event) => {
		events.push(event);
	});
	return { events, context, requests };
}

const CAP_MARKER = "MAXIMUM STEPS REACHED";
describe("turn budget cap", () => {
	it("tells the model about the cap through an ephemeral message that never enters the transcript", async () => {
		const { events, context, requests } = await run({ maxTurns: 2 });

		// The model must have received the instruction...
		const capped = requests.filter((r) =>
			(r.body.messages ?? []).some((m) => typeof m.content === "string" && m.content.includes(CAP_MARKER)),
		);
		expect(capped).toHaveLength(1);
		// ...with tools disabled on that final turn.
		expect(capped[0]?.body.tools).toBeUndefined();

		// ...but it must not have been added to the transcript (which is what gets
		// persisted to the work item and replayed into every later request).
		const polluted = context.messages.filter(
			(m) => m.role === "user" && typeof m.content === "string" && m.content.includes(CAP_MARKER),
		);
		expect(polluted).toHaveLength(0);

		// The user is told through a notice instead of a fake user bubble.
		const notices = events.filter((e) => e.type === "notice");
		expect(notices).toHaveLength(1);
	});

	it("strips legacy correction nudges but keeps a genuine user message", async () => {
		const requests: RecordedRequest[] = [];
		const { server, port } = await startFakeProvider(requests, { toolCall: false });
		servers.push(server);
		const correction = "[system] You have open todo items but have not updated the list for 6 turns.";
		const lookalike = "[system] is not a real instruction I typed";
		const context: AgentContext = {
			systemPrompt: "test",
			messages: [
				{ role: "user", content: "real question", timestamp: 1 },
				{ role: "user", content: correction, timestamp: 2 },
				{ role: "user", content: lookalike, timestamp: 3 },
			],
			tools: [],
		};
		const config: AgentLoopConfig = {
			model: { id: "fake-model", api: "openai-completions", provider: "fake", baseUrl: `http://127.0.0.1:${port}/v1`, thinking: false },
			apiKey: "fake-key",
			tools: [],
			maxTurns: 2,
		};
		await runAgentLoop(["hi"], context, config, undefined, () => {});
		const sent = JSON.stringify(requests[0]!.body.messages ?? []);
		expect(sent).not.toContain(correction);
		expect(sent).toContain("real question");
		// Only the known prefixes are stripped; a lookalike stays.
		expect(sent).toContain(lookalike);
	});

	it("still sends the ephemeral instruction when the transcript carries legacy pollution", async () => {
		const requests: RecordedRequest[] = [];
		const { server, port } = await startFakeProvider(requests, { toolCall: true });
		servers.push(server);

		// Must match the real prefix: the scrub keys off the production marker, so a
		// loose fixture here would silently test nothing.
		const legacy = `${TURN_CAP_MARKER}\n\nThe maximum number of steps allowed for this task has been reached. Tools are disabled until next user input. Respond with text only.`;
		const context: AgentContext = {
			systemPrompt: "test",
			messages: [
				{ role: "user", content: "real question", timestamp: 1 },
				{ role: "user", content: legacy, timestamp: 2 },
			],
			tools: [pingTool],
		};
		const config: AgentLoopConfig = {
			model: {
				id: "fake-model",
				api: "openai-completions",
				provider: "fake",
				baseUrl: `http://127.0.0.1:${port}/v1`,
				thinking: false,
			},
			apiKey: "fake-key",
			tools: [pingTool],
			maxTurns: 1,
		};
		await runAgentLoop(["go"], context, config, undefined, () => {});

		// The new instruction and the legacy pollution share the exact same text,
		// so they can only be told apart structurally: the transcript copy (which
		// sits mid-conversation) must never be replayed, while the appended one is
		// allowed exactly once and only as the final message.
		const capCopies = (request: RecordedRequest): number =>
			(request.body.messages ?? []).filter(
				(m) => typeof m.content === "string" && m.content.trimStart().startsWith(TURN_CAP_MARKER),
			).length;
		expect(requests.length).toBeGreaterThan(1);
		for (const request of requests.slice(0, -1)) {
			expect(capCopies(request)).toBe(0);
		}
		const lastRequest = requests[requests.length - 1];
		expect(capCopies(lastRequest!)).toBe(1);
		const lastMessage = (lastRequest?.body.messages ?? []).at(-1);
		expect(typeof lastMessage?.content === "string" && lastMessage.content.trimStart().startsWith(TURN_CAP_MARKER)).toBe(true);
		// The user's actual question is untouched.
		expect(
			(lastRequest?.body.messages ?? []).some((m) => m.content === "real question"),
		).toBe(true);
	});
});

describe("outbound image budget", () => {
	it("omits older images past maxImageBytes without touching the transcript", async () => {
		const requests: RecordedRequest[] = [];
		const { server, port } = await startFakeProvider(requests, { toolCall: false });
		servers.push(server);
		const image = (id: string, name: string, size: number): Attachment => ({ id, name, mime: "image/png", size, kind: "image" });
		const context: AgentContext = {
			systemPrompt: "test",
			messages: [
				{ role: "user", content: "old", attachments: [image("a", "a-old.png", 600_000)], timestamp: 1 },
				{ role: "user", content: "new", attachments: [image("b", "b-new.png", 600_000)], timestamp: 2 },
			],
			tools: [],
			resolveAttachment: async () => new Uint8Array([1, 2, 3, 4]),
		};
		const config: AgentLoopConfig = {
			model: {
				id: "fake-model",
				api: "openai-completions",
				provider: "fake",
				baseUrl: `http://127.0.0.1:${port}/v1`,
				thinking: false,
			},
			apiKey: "fake-key",
			tools: [],
			maxImageBytes: 1_000_000,
			maxTurns: 5,
		};
		await runAgentLoop([], context, config, undefined, () => {});
		expect(requests).toHaveLength(1);
		// The system prompt rides along as the first message, so skip it here.
		const sent = (requests[0]!.body.messages ?? []).filter((m) => m.role !== "system");
		expect(typeof sent[0]!.content).toBe("string");
		expect(sent[0]!.content).toContain("a-old.png");
		const stored = context.messages[0];
		expect(stored?.role === "user" && stored.attachments?.length).toBe(1);
	});
});

describe("turn budget renewal", () => {
	it("renews the budget while the todo plan still has open items", async () => {
		const turns = { n: 0 };
		const { events, requests } = await run({
			maxTurns: 2,
			hasPendingWork: () => {
				turns.n++;
				return true;
			},
		});

		// maxTurns 2 + 2 renewals x 25 + the final capped turn.
		expect(requests.length).toBeGreaterThan(2 + 25);
		const renewals = events.filter((e) => e.type === "notice" && e.message.includes("已自动延长"));
		expect(renewals).toHaveLength(2);
		// Always bounded: renewals run out and the run still ends.
		const capNotice = events.filter((e) => e.type === "notice" && e.message.includes("续期已用尽"));
		expect(capNotice).toHaveLength(1);
	});

	it("does not renew once every todo item is completed", async () => {
		const { events, requests } = await run({ maxTurns: 2, hasPendingWork: () => false });

		// 3 budgeted turns (2 + the capped one) and nothing extra.
		expect(requests.length).toBe(3);
		expect(events.filter((e) => e.type === "notice" && e.message.includes("已自动延长"))).toHaveLength(0);
	});
});

describe("self-correction delivery", () => {
	it("rides the next request as an ephemeral trailing message and never enters the transcript", async () => {
		const correction = "[system] You are repeating the same tool call with the same arguments.";
		let calls = 0;
		const { events, context, requests } = await run({
			maxTurns: 3,
			afterTurn: async () => (++calls === 1 ? correction : null),
		});

		// Delivered to the model on the turn right after the anomaly...
		const withNudge = requests.filter((r) =>
			(r.body.messages ?? []).some((m) => typeof m.content === "string" && m.content.includes(correction)),
		);
		expect(withNudge).toHaveLength(1);
		expect(withNudge[0]).toBe(requests[1]);
		const sent = withNudge[0]?.body.messages ?? [];
		expect(sent[sent.length - 1]?.content).toBe(correction);

		// ...but never persisted: no transcript entry, no user bubble.
		const polluted = context.messages.filter(
			(m) => m.role === "user" && typeof m.content === "string" && m.content.includes("repeating the same tool call"),
		);
		expect(polluted).toHaveLength(0);
		const bubbles = events.filter(
			(e) => e.type === "message_end" && e.message.role === "user" && e.message.content.includes("repeating the same tool call"),
		);
		expect(bubbles).toHaveLength(0);

		// The user still sees that a correction happened.
		const notices = events.filter(
			(e): e is Extract<AgentEvent, { type: "notice" }> =>
				e.type === "notice" && e.level === "warn" && e.message.includes("自我纠偏"),
		);
		expect(notices).toHaveLength(1);
		expect(notices[0]?.message).not.toContain("[system]");
	});
});

describe("goal anchor", () => {
	it("is sent every turn as an ephemeral trailing message, never persisted", async () => {
		const anchor = "<system-reminder>Objective: do the thing</system-reminder>";
		const { context, requests } = await run({ maxTurns: 3, getPlanAnchor: () => anchor });

		const anchored = requests.filter((r) =>
			(r.body.messages ?? []).some((m) => typeof m.content === "string" && m.content.includes("Objective: do the thing")),
		);
		expect(anchored.length).toBeGreaterThanOrEqual(2);
		for (const req of anchored) {
			const sent = req.body.messages ?? [];
			expect(sent[sent.length - 1]?.content).toBe(anchor);
		}
		const persisted = context.messages.filter(
			(m) => m.role === "user" && typeof m.content === "string" && m.content.includes("Objective: do the thing"),
		);
		expect(persisted).toHaveLength(0);
	});

	it("combines a pending correction with the anchor", async () => {
		const correction = "[system] stop repeating";
		let calls = 0;
		const { requests } = await run({
			maxTurns: 3,
			afterTurn: async () => (++calls === 1 ? correction : null),
			getPlanAnchor: () => "ANCHOR-TEXT",
		});
		const both = requests.filter((r) => {
			const last = (r.body.messages ?? []).at(-1);
			return typeof last?.content === "string" && last.content.includes(correction) && last.content.includes("ANCHOR-TEXT");
		});
		expect(both.length).toBeGreaterThanOrEqual(1);
	});
});

describe("assistant message identity", () => {
	it("stamps model id and reasoning effort onto assistant messages", async () => {
		const requests: RecordedRequest[] = [];
		const { server, port } = await startFakeProvider(requests, { toolCall: false });
		servers.push(server);
		const context: AgentContext = { systemPrompt: "test", messages: [], tools: [] };
		const config: AgentLoopConfig = {
			model: {
				id: "history-model",
				api: "openai-completions",
				provider: "fake",
				baseUrl: `http://127.0.0.1:${port}/v1`,
				thinking: false,
				reasoningEffort: "low",
			},
			apiKey: "fake-key",
			tools: [],
			maxTurns: 5,
		};
		await runAgentLoop(["hi"], context, config, undefined, () => {});
		const assistants = context.messages.filter((m) => m.role === "assistant");
		expect(assistants.length).toBeGreaterThan(0);
		for (const m of assistants) {
			if (m.role !== "assistant") continue;
			expect(m.model).toBe("history-model");
			expect(m.reasoningEffort).toBe("low");
		}
	});
});

describe("message_update wire shape", () => {
	it("sends only deltas, never the whole accumulated message per frame", async () => {
		const requests: RecordedRequest[] = [];
		const { server, port } = await startFakeProvider(requests, { toolCall: false });
		servers.push(server);
		const context: AgentContext = { systemPrompt: "test", messages: [], tools: [] };
		const config: AgentLoopConfig = {
			model: { id: "delta-model", api: "openai-completions", provider: "fake", baseUrl: `http://127.0.0.1:${port}/v1`, thinking: false },
			apiKey: "fake-key",
			tools: [],
			maxTurns: 5,
		};
		const events: AgentEvent[] = [];
		await runAgentLoop(["hi"], context, config, undefined, (e) => {
			events.push(e);
		});

		let deltaFrames = 0;
		let text = "";
		for (const e of events) {
			if (e.type !== "message_update") continue;
			// Streaming frames must be delta-only: resending the accumulated message
			// turned a 45 KB answer into ~92 MB of frames.
			if (e.message) continue;
			deltaFrames++;
			expect(e.part === "text" || e.part === "thinking").toBe(true);
			expect(typeof e.messageId).toBe("number");
			if (e.part === "text") text += e.delta;
		}
		expect(deltaFrames).toBeGreaterThan(0);
		expect(text).toBe("summary of work");
	});
});
