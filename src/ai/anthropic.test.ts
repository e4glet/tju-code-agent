import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { anthropicMessages } from "./anthropic.ts";
import type { Context } from "./types.ts";
import type { Model } from "../core/types.ts";

interface RecordedRequest {
	url: string;
	body: {
		max_tokens?: number;
		thinking?: { type?: string; budget_tokens?: number };
	};
}

function startFakeAnthropic(recorded: RecordedRequest[]): Promise<{ server: Server; port: number }> {
	const server = createServer((req, res) => {
		let raw = "";
		req.on("data", (chunk) => {
			raw += chunk;
		});
		req.on("end", () => {
			try {
				recorded.push({ url: req.url ?? "", body: JSON.parse(raw) });
			} catch {
				recorded.push({ url: req.url ?? "", body: {} });
			}
			res.writeHead(200, { "content-type": "text/event-stream" });
			res.write(`data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 10 } } })}\n\n`);
			res.write(
				`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "hi" } })}\n\n`,
			);
			res.write(`data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "stop" } })}\n\n`);
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

const context: Context = {
	systemPrompt: "",
	messages: [{ role: "user", content: "hi", timestamp: 1 }],
};

async function requestBody(extra?: Partial<Model>): Promise<RecordedRequest["body"]> {
	const recorded: RecordedRequest[] = [];
	const { server, port } = await startFakeAnthropic(recorded);
	servers.push(server);
	const model: Model = {
		id: "qwen3-max",
		api: "anthropic-messages",
		provider: "dashscope",
		baseUrl: `http://127.0.0.1:${port}`,
		thinking: true,
		...extra,
	};
	const events = await anthropicMessages.stream(model, context, { apiKey: "test-key" });
	for await (const _ of events) {
		// drain
	}
	expect(recorded).toHaveLength(1);
	return recorded[0]!.body;
}

describe("anthropic thinking budget", () => {
	it("raises the default ceiling for high effort so visible text keeps headroom", async () => {
		const body = await requestBody({ reasoningEffort: "high" });
		expect(body.max_tokens).toBe(16384 + 2048);
		expect(body.thinking?.budget_tokens).toBe(16384);
		expect((body.max_tokens ?? 0) - (body.thinking?.budget_tokens ?? 0)).toBeGreaterThanOrEqual(2048);
	});

	it("leaves low effort and thinking-off requests exactly as before", async () => {
		const low = await requestBody({ reasoningEffort: "low" });
		expect(low.max_tokens).toBe(4096);
		expect(low.thinking?.budget_tokens).toBe(2048);
		const off = await requestBody({ reasoningEffort: "none" });
		expect(off.max_tokens).toBe(4096);
		expect(off.thinking).toMatchObject({ type: "disabled" });
	});

	it("respects an explicit maxTokens and only shrinks the budget", async () => {
		const body = await requestBody({ reasoningEffort: "high", maxTokens: 8000 });
		expect(body.max_tokens).toBe(8000);
		expect(body.thinking?.budget_tokens).toBe(8000 - 2048);
	});
});
