import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createSubAgentTool } from "./subagent.ts";
import type { AgentProviderState } from "../types.ts";

interface Recorded {
	url: string;
	authorization?: string;
}

function startFakeProvider(recorded: Recorded[]): Promise<{ server: Server; port: number }> {
	const server = createServer((req, res) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			recorded.push({ url: req.url ?? "", authorization: req.headers.authorization });
			res.writeHead(200, { "content-type": "text/event-stream" });
			res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "sub-agent result" } }] })}\n\n`);
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
});
