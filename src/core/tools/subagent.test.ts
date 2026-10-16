import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createSubAgentTool, subAgentSystemPrompt } from "./subagent.ts";
import type { AgentTool, AgentProviderState } from "../types.ts";

interface Recorded {
	url: string;
	authorization?: string;
	tools?: string[];
	systemPrompt?: string;
}

function startFakeProvider(recorded: Recorded[]): Promise<{ server: Server; port: number }> {
	const server = createServer((req, res) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			let parsed: { tools?: Array<{ function?: { name?: string } }>; messages?: Array<{ role?: string; content?: unknown }> } = {};
			try {
				parsed = JSON.parse(body);
			} catch {
				parsed = {};
			}
			const systemMessage = parsed.messages?.find((m) => m.role === "system");
			recorded.push({
				url: req.url ?? "",
				authorization: req.headers.authorization,
				tools: parsed.tools?.map((t) => t.function?.name ?? "").filter(Boolean),
				systemPrompt: typeof systemMessage?.content === "string" ? systemMessage.content : undefined,
			});
			res.writeHead(200, { "content-type": "text/event-stream" });
			res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "sub-agent result" } }] })}\n\n`);
			res.write(
				`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 120, completion_tokens: 30, prompt_cache_hit_tokens: 40 } })}\n\n`,
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

describe("sub-agent interface", () => {
	it("reads the provider state at call time instead of a creation-time snapshot", async () => {
		const recorded: Recorded[] = [];
		const { server, port } = await startFakeProvider(recorded);
		servers.push(server);

		const provider: AgentProviderState = {
			model: { id: "stale-model", api: "openai-completions", provider: "openai", baseUrl: "http://127.0.0.1:1" },
			apiKey: "stale-key",
		};
		const tool = createSubAgentTool({ cwd: process.cwd(), provider, maxTurns: 1 });

		provider.model = {
			id: "live-model",
			api: "openai-completions",
			provider: "live",
			baseUrl: `http://127.0.0.1:${port}/v1`,
		};
		provider.apiKey = "live-key";

		const result = await tool.execute(
			{ toolCallId: "t1", signal: new AbortController().signal, onUpdate: () => {} },
			{ task: "say hi" },
		);

		expect(result.content).toContain("sub-agent result");
		expect(recorded).toHaveLength(1);
		expect(recorded[0]?.url).toBe("/v1/chat/completions");
		expect(recorded[0]?.authorization).toBe("Bearer live-key");
	});

	it("reports its own token usage so the evaluator can account for it", async () => {
		const recorded: Recorded[] = [];
		const { server, port } = await startFakeProvider(recorded);
		servers.push(server);
		const provider: AgentProviderState = {
			model: { id: "live-model", api: "openai-completions", provider: "openai", baseUrl: `http://127.0.0.1:${port}/v1` },
			apiKey: "live-key",
		};
		const tool = createSubAgentTool({ cwd: process.cwd(), provider, maxTurns: 1 });

		const result = await tool.execute(
			{ toolCallId: "t1", signal: new AbortController().signal, onUpdate: () => {} },
			{ task: "say hi" },
		);

		const details = result.details as { agent?: string; turns: number; usage: Record<string, number> } | undefined;
		expect(details?.turns).toBeGreaterThan(0);
		expect(details?.agent).toBe("general");
		expect(details?.usage).toEqual({ input: 120, output: 30, totalTokens: 150, cacheRead: 40, cacheWrite: 80 });
	});

	it("locks an explore sub-agent to a read-only toolset", async () => {
		const recorded: Recorded[] = [];
		const { server, port } = await startFakeProvider(recorded);
		servers.push(server);
		const provider: AgentProviderState = {
			model: { id: "live-model", api: "openai-completions", provider: "openai", baseUrl: `http://127.0.0.1:${port}/v1` },
			apiKey: "live-key",
		};
		const stub = (name: string): AgentTool => ({
			name,
			label: name,
			description: name,
			parameters: z.object({}),
			execute: async () => ({ content: "ok" }),
		});
		const tool = createSubAgentTool({
			cwd: process.cwd(),
			provider,
			maxTurns: 1,
			tools: ["read", "grep", "glob", "bash", "write", "edit", "fetch", "scan"].map(stub),
		});

		const explore = await tool.execute(
			{ toolCallId: "t1", signal: new AbortController().signal, onUpdate: () => {} },
			{ agent: "explore", task: "find the entry point" },
		);
		expect(recorded[0]?.tools?.sort()).toEqual(["glob", "grep", "read"]);
		expect((explore.details as { agent?: string })?.agent).toBe("explore");

		const general = await tool.execute(
			{ toolCallId: "t2", signal: new AbortController().signal, onUpdate: () => {} },
			{ agent: "general", task: "rename a symbol" },
		);
		expect(recorded[1]?.tools?.length).toBe(8);
		expect((general.details as { agent?: string })?.agent).toBe("general");
	});

	it("ignores the agent parameter when arm C is off", async () => {
		const recorded: Recorded[] = [];
		const { server, port } = await startFakeProvider(recorded);
		servers.push(server);
		const provider: AgentProviderState = {
			model: { id: "live-model", api: "openai-completions", provider: "openai", baseUrl: `http://127.0.0.1:${port}/v1` },
			apiKey: "live-key",
		};
		const stub = (name: string): AgentTool => ({
			name,
			label: name,
			description: name,
			parameters: z.object({}),
			execute: async () => ({ content: "ok" }),
		});
		const tool = createSubAgentTool({
			cwd: process.cwd(),
			provider,
			maxTurns: 1,
			tools: ["read", "grep", "glob", "bash", "write", "edit", "fetch", "scan"].map(stub),
			exploreEnabled: false,
		});
		const res = await tool.execute(
			{ toolCallId: "t1", signal: new AbortController().signal, onUpdate: () => {} },
			{ agent: "explore", task: "find the entry point" },
		);
		expect(recorded[0]?.tools?.length).toBe(8);
		expect((res.details as { agent?: string })?.agent).toBe("general");
		expect(tool.description).not.toContain("explore");
	});

	it("requires the read-only rules and the structured result contract", () => {		const explore = subAgentSystemPrompt("D:\\proj", "m", "explore");
		expect(explore).toContain("EXCLUSIVELY to search and analyze");
		expect(explore).toContain("MUST NOT create, modify, delete, move or copy files");
		expect(explore).toContain("## Files");
		expect(explore).toContain("## Open questions");
		const general = subAgentSystemPrompt("D:\\proj", "m", "general");
		expect(general).not.toContain("EXCLUSIVELY to search and analyze");
		expect(general).toContain("## Evidence");
	});
});
