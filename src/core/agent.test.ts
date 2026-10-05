import { describe, expect, it } from "vitest";
import { Agent } from "./agent.ts";
import type { Model } from "./types.ts";

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
