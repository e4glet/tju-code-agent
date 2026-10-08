import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { openaiCompletions } from "./openai.ts";
import type { Context } from "./types.ts";
import type { Model } from "../core/types.ts";
import { affinityHeaders } from "./utils.ts";

describe("affinityHeaders", () => {
	it("sends the session header plus client UA on opencode endpoints", () => {
		expect(affinityHeaders("https://opencode.ai/zen/go/v1", "work-1")).toMatchObject({
			"x-opencode-session": "work-1",
		});
		expect(affinityHeaders("https://opencode.ai/zen/go/v1", "work-1")["user-agent"]).toMatch(/^tju-code\//);
	});
	it("withholds the session header on other endpoints", () => {
		const headers = affinityHeaders("https://api.deepseek.com", "work-1");
		expect(headers["x-opencode-session"]).toBeUndefined();
		expect(headers["user-agent"]).toMatch(/^tju-code\//);
	});
	it("sends only the UA without a session", () => {
		const headers = affinityHeaders("https://opencode.ai/zen/go/v1", undefined);
		expect(headers["x-opencode-session"]).toBeUndefined();
		expect(headers["user-agent"]).toMatch(/^tju-code\//);
	});
	it("never throws on malformed base urls", () => {
		expect(() => affinityHeaders(":::", "work-1")).not.toThrow();
	});
});

const servers: Server[] = [];
afterEach(() => {
	for (const server of servers.splice(0)) server.close();
});

describe("openai adapter headers", () => {
	it("forwards the affinity headers on chat requests", async () => {
		const seen: Record<string, string | string[] | undefined>[] = [];
		const server = createServer((req, res) => {
			let raw = "";
			req.on("data", (chunk) => {
				raw += chunk;
			});
			req.on("end", () => {
				seen.push({ ...req.headers });
				res.writeHead(200, { "content-type": "text/event-stream" });
				res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "hi" }, finish_reason: "stop" }] })}\n\n`);
				res.write("data: [DONE]\n\n");
				res.end();
			});
		});
		await new Promise<void>((resolve) => {
			server.listen(0, "127.0.0.1", () => resolve());
		});
		servers.push(server);
		const address = server.address();
		const port = typeof address === "object" && address ? address.port : 0;
		const model: Model = {
			id: "deepseek-v4.1-flash",
			api: "openai-completions",
			provider: "opencode",
			baseUrl: `http://127.0.0.1:${port}/v1`,
		};
		const context: Context = { messages: [{ role: "user", content: "hi", timestamp: 1 }] };
		const events = await openaiCompletions.stream(model, context, { apiKey: "k", sessionId: "work-9" });
		for await (const _ of events) {
			// drain
		}
		expect(seen).toHaveLength(1);
		expect(seen[0]?.["user-agent"]).toMatch(/^tju-code\//);
		expect(seen[0]?.["x-opencode-session"]).toBeUndefined();
	});
});
