import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Agent, buildPlanAnchor } from "./agent.ts";
import type { Message, Model, UserMessage } from "./types.ts";

const BASE_MODEL: Model = { id: "m1", api: "openai-completions", provider: "openai" };

describe("Agent provider state", () => {
	it("exposes one mutable object shared with derived components", () => {
		const agent = new Agent({ model: BASE_MODEL, apiKey: "key-1" });
		const shared = agent.provider;
		expect(shared.model).toEqual(BASE_MODEL);
		expect(shared.apiKey).toBe("key-1");

		agent.setModel({ ...BASE_MODEL, id: "m2" });

		expect(shared.model.id).toBe("m2");
		expect(shared.apiKey).toBe("key-1");
		expect(agent.state.model.id).toBe("m2");
	});

	it("switches api kind, endpoint and key together", () => {
		const agent = new Agent({ model: BASE_MODEL, apiKey: "key-1" });
		const shared = agent.provider;

		agent.setProvider({
			model: {
				id: "qwen-max",
				api: "openai-completions",
				provider: "dashscope",
				baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
			},
			apiKey: "key-2",
		});

		expect(shared.apiKey).toBe("key-2");
		expect(shared.model).toMatchObject({ id: "qwen-max", provider: "dashscope" });
		expect(agent.state.model.baseUrl).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1");
	});

	it("adopts a caller-provided state object instead of copying it", () => {
		const provider = { model: BASE_MODEL, apiKey: "key-1" };
		const agent = new Agent({ model: BASE_MODEL, provider });
		expect(agent.provider).toBe(provider);

		agent.setProvider({ model: { ...BASE_MODEL, id: "m9" }, apiKey: "key-9" });
		expect(provider.model.id).toBe("m9");
		expect(provider.apiKey).toBe("key-9");
	});

	it("never leaks the key through the state snapshot", () => {
		const agent = new Agent({ model: BASE_MODEL, apiKey: "secret" });
		expect(JSON.stringify(agent.state)).not.toContain("secret");
	});
});

describe("buildPlanAnchor", () => {
	const user = (content: string, extra: Partial<{ compaction: boolean; steering: boolean }> = {}) =>
		({ role: "user" as const, content, timestamp: 1, ...extra });

	it("uses the first real user message and skips markers and steering injections", () => {
		const anchor = buildPlanAnchor(
			[
				user("__checkpoint__", { compaction: true }),
				user("steer note", { steering: true }),
				user("rewrite the README intro"),
				user("later clarification"),
			],
			[],
		);
		expect(anchor).toContain("rewrite the README intro");
		expect(anchor).not.toContain("__checkpoint__");
		expect(anchor).not.toContain("steer note");
		expect(anchor).not.toContain("later clarification");
		expect(anchor).toContain("not a new request");
	});

	it("lists only open plan items and caps the list", () => {
		const todos = Array.from({ length: 9 }, (_, i) => ({
			content: `task ${i}`,
			status: i === 0 ? ("completed" as const) : ("pending" as const),
		}));
		const anchor = buildPlanAnchor([user("do work")], todos);
		expect(anchor).not.toContain("- [completed] task 0");
		expect(anchor).toContain("Open plan items (8):");
		expect(anchor).toContain("…and 2 more");
	});

	it("returns undefined when there is nothing to anchor", () => {
		expect(buildPlanAnchor([], [])).toBeUndefined();
	});
});

describe("Agent setSystemPrompt", () => {
	it("replaces the prompt visible in state", () => {
		const agent = new Agent({ model: BASE_MODEL, systemPrompt: "base" });
		agent.setSystemPrompt("base\nCurrent working directory: D:\\new");
		expect(agent.state.systemPrompt).toContain("D:\\new");
	});
});

describe("Agent prompt sections", () => {
	const flash = { ...BASE_MODEL, id: "deepseek-v4.1-flash" };
	const sections = { base: "base prompt", cwd: "D:\\proj", docs: "proj docs" };

	it("composes the overlay for a drifting model on creation", () => {
		const agent = new Agent({ model: flash, promptSections: sections });
		expect(agent.state.systemPrompt).toContain("Scope discipline");
		expect(agent.state.systemPrompt).toContain("D:\\proj");
	});

	it("swaps the overlay automatically on setModel and setProvider", () => {
		const agent = new Agent({ model: BASE_MODEL, promptSections: sections });
		expect(agent.state.systemPrompt).not.toContain("Scope discipline");
		agent.setModel(flash);
		expect(agent.state.systemPrompt).toContain("Scope discipline");
		agent.setProvider({ model: BASE_MODEL, apiKey: "k" });
		expect(agent.state.systemPrompt).not.toContain("Scope discipline");
	});

	it("leaves caller-owned prompts alone when sections are unset", () => {
		const agent = new Agent({ model: flash, systemPrompt: "base" });
		expect(agent.state.systemPrompt).toBe("base");
		agent.setModel(BASE_MODEL);
		expect(agent.state.systemPrompt).toBe("base");
	});

	it("recovers the base for stateless rewraps", () => {
		const agent = new Agent({ model: flash, promptSections: sections });
		expect(agent.promptBase).toBe("base prompt");
	});
});

describe("Agent steer", () => {
	it("marks injected messages so replay keeps the run as a single round", () => {
		const agent = new Agent({ model: BASE_MODEL });
		const injected: UserMessage = { role: "user", content: "补充说明", timestamp: 7 };
		agent.steer(injected);
		expect(injected.steering).toBe(true);
	});
});

describe("Agent revertTo", () => {
	const um = (timestamp: number, content: string): UserMessage => ({ role: "user", content, timestamp });

	it("drops the target message and everything after it", () => {
		const agent = new Agent({ model: BASE_MODEL });
		agent.restore({ messages: [um(1, "first"), um(2, "second"), um(3, "third")] });
		agent.revertTo(2);
		expect(agent.state.messages.map((m) => (m as UserMessage).content)).toEqual(["first"]);
	});

	it("rejects an unknown timestamp without touching the transcript", () => {
		const agent = new Agent({ model: BASE_MODEL });
		agent.restore({ messages: [um(1, "first")] });
		expect(() => agent.revertTo(99)).toThrow("Unknown message timestamp");
		expect(agent.state.messages).toHaveLength(1);
	});
});

describe("Agent compaction keeps the full transcript", () => {
	const servers: Server[] = [];
	afterEach(() => {
		for (const server of servers.splice(0)) server.close();
	});

	function startFakeProvider(): Promise<{ server: Server; port: number }> {
		const server = createServer((req, res) => {
			req.on("data", () => {});
			req.on("end", () => {
				res.writeHead(200, { "content-type": "text/event-stream" });
				res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "done" } }] })}\n\n`);
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

	function seedTranscript(): Message[] {
		const bulk = "Z".repeat(4_000);
		const seed: Message[] = [{ role: "user", content: "SEED REQUIREMENT", timestamp: 1 }];
		for (let i = 0; i < 12; i++) {
			seed.push({
				role: "assistant",
				content: [{ type: "text", text: bulk }],
				api: "openai-completions",
				provider: "fake",
				model: "m",
				usage: { input: 0, output: 0, totalTokens: 0 },
				stopReason: "stop",
				timestamp: 2 + i,
			});
		}
		return seed;
	}

	it("inserts one marker and never shortens Agent.messages", async () => {
		const { server, port } = await startFakeProvider();
		servers.push(server);
		const agent = new Agent({
			model: { id: "m", api: "openai-completions", provider: "fake", baseUrl: `http://127.0.0.1:${port}/v1`, thinking: false },
			apiKey: "k",
			systemPrompt: "sys",
			tools: [],
			maxContextTokens: 5_000,
			maxTurns: 2,
		});
		const seed = seedTranscript();
		agent.restore({ messages: seed });

		await agent.prompt("go");

		const messages = agent.state.messages;
		expect(messages.filter((m) => m.role === "user" && m.compaction === true)).toHaveLength(1);
		// Full separation: compaction must not delete history.
		for (const m of seed) expect(messages).toContain(m);
		expect(messages.filter((m) => m.role === "assistant").length).toBeGreaterThanOrEqual(12);
	});

	it("caps the folded region when pruneFoldedKeep is set", async () => {
		const { server, port } = await startFakeProvider();
		servers.push(server);
		const agent = new Agent({
			model: { id: "m", api: "openai-completions", provider: "fake", baseUrl: `http://127.0.0.1:${port}/v1`, thinking: false },
			apiKey: "k",
			systemPrompt: "sys",
			tools: [],
			maxContextTokens: 5_000,
			maxTurns: 2,
			pruneFoldedKeep: 3,
		});
		agent.restore({ messages: seedTranscript() });

		await agent.prompt("go");

		const messages = agent.state.messages;
		const markerIndex = messages.findIndex((m) => m.role === "user" && m.compaction === true);
		expect(markerIndex).toBe(3);
		// The pruned old folded messages are physically gone.
		expect(messages.some((m) => m.role === "user" && m.content === "SEED REQUIREMENT")).toBe(false);
	});
});
