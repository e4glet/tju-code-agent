import { describe, expect, it } from "vitest";
import { PROVIDER_ENTRIES, PROVIDER_PROFILES, resolveConfig, resolveProvider } from "./config.ts";

const NO_ENV: NodeJS.ProcessEnv = {};

describe("resolveProvider defaults", () => {
	it("falls back to the built-in OpenAI defaults with no overrides", () => {
		const resolved = resolveProvider({}, NO_ENV);
		expect(resolved).toMatchObject({
			api: "openai-completions",
			provider: "openai",
			model: "gpt-4o-mini",
			baseUrl: undefined,
			apiKey: undefined,
			entry: undefined,
			unknownId: undefined,
		});
	});

	it("uses the Anthropic defaults for the anthropic api kind", () => {
		const resolved = resolveProvider({ api: "anthropic-messages" }, NO_ENV);
		expect(resolved).toMatchObject({
			api: "anthropic-messages",
			provider: "anthropic",
			model: "claude-sonnet-4-5",
		});
	});

	it("accepts the anthropic and claude api aliases", () => {
		for (const api of ["anthropic", "claude", "Anthropic", "ANTHROPIC-MESSAGES"]) {
			expect(resolveProvider({ api }, NO_ENV).api).toBe("anthropic-messages");
		}
	});

	it("ignores an unusable api value instead of throwing", () => {
		expect(resolveProvider({ api: "grpc" }, NO_ENV).api).toBe("openai-completions");
	});
});

describe("resolveProvider presets", () => {
	it("resolves a known preset from its entry", () => {
		const resolved = resolveProvider({ id: "deepseek" }, NO_ENV);
		expect(resolved.unknownId).toBeUndefined();
		expect(resolved.entry?.id).toBe("deepseek");
		expect(resolved.api).toBe("openai-completions");
		expect(resolved.provider).toBe("deepseek");
		expect(resolved.model).toBe("deepseek-v4-flash");
		expect(resolved.baseUrl).toBe("https://api.deepseek.com");
	});

	it("is case insensitive about the preset id", () => {
		expect(resolveProvider({ id: "DeepSeek" }, NO_ENV).provider).toBe("deepseek");
	});

	it("reports an unknown preset through unknownId and keeps the defaults", () => {
		const resolved = resolveProvider({ id: "nope" }, NO_ENV);
		expect(resolved.unknownId).toBe("nope");
		expect(resolved.entry).toBeUndefined();
		expect(resolved.provider).toBe("openai");
		expect(resolved.model).toBe("gpt-4o-mini");
	});

	it("keeps every entry self-consistent", () => {
		for (const [key, entry] of Object.entries(PROVIDER_ENTRIES)) {
			expect(entry.id).toBe(key);
			expect(entry.label).toBeTruthy();
			expect(entry.baseUrl).toMatch(/^https:\/\//);
			expect(entry.defaultModel).toBeTruthy();
			expect(resolveProvider({ id: key }, NO_ENV).model).toBe(entry.defaultModel);
		}
	});

	it("keeps the legacy profile exports pointing at the same table", () => {
		expect(PROVIDER_PROFILES).toBe(PROVIDER_ENTRIES);
	});
});

describe("resolveProvider precedence", () => {
	it("lets an explicit model override the preset default", () => {
		expect(resolveProvider({ id: "deepseek", model: "deepseek-v4-pro" }, NO_ENV).model).toBe("deepseek-v4-pro");
	});

	it("lets the preset model env override the preset default", () => {
		const table = {
			...PROVIDER_ENTRIES,
			custom: {
				id: "custom",
				label: "Custom",
				api: "openai-completions",
				provider: "openai",
				baseUrl: "https://custom.example/v1",
				defaultModel: "base-model",
				modelEnv: "CUSTOM_MODEL",
			},
		} as typeof PROVIDER_ENTRIES;
		const resolved = resolveProvider({ id: "custom" }, { CUSTOM_MODEL: "custom-model" }, table);
		expect(resolved.model).toBe("custom-model");
	});

	it("prefers the preset key env over the generic one", () => {
		expect(resolveProvider({ id: "deepseek" }, { DEEPSEEK_API_KEY: "preset", OPENAI_API_KEY: "generic" }).apiKey).toBe(
			"preset",
		);
		expect(resolveProvider({ id: "deepseek" }, { OPENAI_API_KEY: "generic" }).apiKey).toBe("generic");
	});

	it("prefers an explicit key over every env var", () => {
		const env = { DEEPSEEK_API_KEY: "preset", OPENAI_API_KEY: "generic" };
		expect(resolveProvider({ id: "deepseek", apiKey: "explicit" }, env).apiKey).toBe("explicit");
	});

	it("prefers the preset base url env over the preset default", () => {
		const resolved = resolveProvider({ id: "deepseek" }, { DEEPSEEK_BASE_URL: "https://proxy.example/v1" });
		expect(resolved.baseUrl).toBe("https://proxy.example/v1");
	});

	it("still lets the generic base url env win over the preset default", () => {
		const resolved = resolveProvider({ id: "deepseek" }, { OPENAI_BASE_URL: "https://gateway.example/v1" });
		expect(resolved.baseUrl).toBe("https://gateway.example/v1");
	});

	it("prefers an explicit base url over every env var", () => {
		const env = { DEEPSEEK_BASE_URL: "https://proxy.example/v1", OPENAI_BASE_URL: "https://gateway.example/v1" };
		expect(resolveProvider({ id: "deepseek", baseUrl: "https://direct.example" }, env).baseUrl).toBe(
			"https://direct.example",
		);
	});

	it("honours an explicit provider id even when it is empty", () => {
		expect(resolveProvider({ provider: "" }, NO_ENV).provider).toBe("");
	});

	it("ignores empty-string overrides the way flags are parsed", () => {
		const resolved = resolveProvider({ id: "deepseek", model: "", apiKey: "", baseUrl: "" }, NO_ENV);
		expect(resolved.model).toBe("deepseek-v4-flash");
		expect(resolved.baseUrl).toBe("https://api.deepseek.com");
		expect(resolved.apiKey).toBeUndefined();
	});

	it("prefers the key stored for the entry over the generic env var", () => {
		const resolved = resolveProvider({ id: "deepseek" }, { OPENAI_API_KEY: "generic" }, PROVIDER_ENTRIES, {
			deepseek: "stored",
		});
		expect(resolved.apiKey).toBe("stored");
	});

	it("still prefers the entry key env over the stored key", () => {
		const resolved = resolveProvider({ id: "deepseek" }, { DEEPSEEK_API_KEY: "preset" }, PROVIDER_ENTRIES, {
			deepseek: "stored",
		});
		expect(resolved.apiKey).toBe("preset");
	});

	it("lets an explicit key win over the stored key", () => {
		const resolved = resolveProvider({ id: "deepseek", apiKey: "explicit" }, NO_ENV, PROVIDER_ENTRIES, {
			deepseek: "stored",
		});
		expect(resolved.apiKey).toBe("explicit");
	});

	it("ignores a stored key when no entry is selected", () => {
		expect(resolveProvider({}, NO_ENV, PROVIDER_ENTRIES, { deepseek: "stored" }).apiKey).toBeUndefined();
	});
});

describe("resolveConfig", () => {
	it("warns about an unknown profile and still resolves", () => {
		const config = resolveConfig({ profile: "nope" }, NO_ENV);
		expect(config.warnings?.[0]).toContain("nope");
		expect(config.api).toBe("openai-completions");
		expect(config.model).toBe("gpt-4o-mini");
	});

	it("does not warn about a known profile", () => {
		expect(resolveConfig({ profile: "qwen" }, NO_ENV).warnings).toBeUndefined();
	});

	it("resolves a profile into the run config", () => {
		const config = resolveConfig({ profile: "qwen" }, NO_ENV);
		expect(config).toMatchObject({
			api: "openai-completions",
			provider: "dashscope",
			model: "qwen-max",
			baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
			thinking: true,
		});
	});

	it("resolves the opencode go preset to its gateway and default model", () => {
		const config = resolveConfig({ profile: "opencode" }, NO_ENV);
		expect(config).toMatchObject({
			api: "openai-completions",
			provider: "opencode",
			model: "deepseek-v4.1-flash",
			baseUrl: "https://opencode.ai/zen/go/v1",
		});
	});

	it("resolves the openai preset to its defaults", () => {
		const config = resolveConfig({ profile: "openai" }, NO_ENV);
		expect(config).toMatchObject({
			api: "openai-completions",
			provider: "openai",
			model: "gpt-6.1-sol",
			baseUrl: "https://api.openai.com/v1",
		});
	});

	it("lets flags win over the profile and the environment", () => {
		const config = resolveConfig(
			{ profile: "deepseek", model: "flag-model", "api-key": "flag-key", "base-url": "https://flag.example" },
			{ DEEPSEEK_API_KEY: "env-key", DEEPSEEK_BASE_URL: "https://env.example" },
		);
		expect(config.model).toBe("flag-model");
		expect(config.apiKey).toBe("flag-key");
		expect(config.baseUrl).toBe("https://flag.example");
	});

	it("keeps thinking on by default and off when disabled", () => {
		expect(resolveConfig({}, NO_ENV).thinking).toBe(true);
		expect(resolveConfig({ "no-thinking": true }, NO_ENV).thinking).toBe(false);
		expect(resolveConfig({ thinking: "false" }, NO_ENV).thinking).toBe(false);
	});

	it("keeps an explicit api kind over the profile api kind", () => {
		expect(resolveConfig({ profile: "deepseek", api: "anthropic" }, NO_ENV).api).toBe("anthropic-messages");
	});

	it("drops non-positive numeric flags", () => {
		expect(resolveConfig({ "max-turns": "0", "max-tokens": "-5" }, NO_ENV).maxTurns).toBeUndefined();
		expect(resolveConfig({ "max-turns": "0", "max-tokens": "-5" }, NO_ENV).maxTokens).toBeUndefined();
		expect(resolveConfig({ "max-turns": "7" }, NO_ENV).maxTurns).toBe(7);
	});

	it("reads the update url from the flag or the environment", () => {
		expect(resolveConfig({ "update-url": "https://up.example" }, NO_ENV).updateUrl).toBe("https://up.example");
		expect(resolveConfig({}, { TJU_UPDATE_URL: "https://env.example" }).updateUrl).toBe("https://env.example");
	});

	it("resolves the stored key at startup when no flag or env var carries it", () => {
		const config = resolveConfig({ profile: "deepseek" }, NO_ENV, PROVIDER_ENTRIES, { deepseek: "stored" });
		expect(config.apiKey).toBe("stored");
		expect(config.providerEntryId).toBe("deepseek");
	});
});
