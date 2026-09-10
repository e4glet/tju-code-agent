import type { ApiKind, Model } from "./core/types.ts";

export interface CliFlags {
	[flag: string]: string | boolean | undefined;
}

/** Parsed agent run configuration (resolved from flags + environment). */
export interface RunConfig {
	api: ApiKind;
	provider: string;
	model: string;
	apiKey?: string;
	baseUrl?: string;
	maxTokens?: number;
	/** Extended thinking/reasoning for the provider. Defaults to true. */
	thinking?: boolean;
	/** Transcript token budget. When exceeded, context is compressed. */
	maxContextTokens?: number;
	/** Maximum assistant turns per run before forcing a final summary turn. Default 50. */
	maxTurns?: number;
	/** Directory for persisted run event logs. Defaults to ~/.tju-code/logs. */
	logDir?: string;
	/** Delete run logs older than this many days. Defaults to 7. */
	logRetentionDays?: number;
	/** Directory for persisted work items. Defaults to ~/.tju-code/works. */
	sessionDir?: string;
}

const DEFAULT_MODELS: Record<ApiKind, { id: string; provider: string }> = {
	"openai-completions": { id: "gpt-4o-mini", provider: "openai" },
	"anthropic-messages": { id: "claude-sonnet-4-5", provider: "anthropic" },
};

/** One-key presets for common OpenAI-compatible providers. */
export interface ProviderProfile {
	api: ApiKind;
	provider: string;
	id: string;
	baseUrl: string;
}

export const PROVIDER_PROFILES: Record<string, ProviderProfile> = {
	deepseek: {
		api: "openai-completions",
		provider: "deepseek",
		id: "deepseek-v4-flash",
		baseUrl: "https://api.deepseek.com",
	},
	kimi: {
		api: "openai-completions",
		provider: "moonshot",
		id: "moonshot-v1-8k",
		baseUrl: "https://api.moonshot.cn/v1",
	},
	qwen: {
		api: "openai-completions",
		provider: "dashscope",
		id: "qwen-max",
		baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
	},
	glm: {
		api: "openai-completions",
		provider: "zhipu",
		id: "glm-4-plus",
		baseUrl: "https://open.bigmodel.cn/api/paas/v4",
	},
	amd: {
		api: "openai-completions",
		provider: "amd",
		id: "DeepSeek-V4-Flash",
		baseUrl: "https://developer.amd.com.cn/radeon/api/v1",
	},
};

const PROFILE_KEY_ENV: Record<string, string> = {
	deepseek: "DEEPSEEK_API_KEY",
	kimi: "MOONSHOT_API_KEY",
	qwen: "DASHSCOPE_API_KEY",
	glm: "ZHIPU_API_KEY",
	amd: "AI_API_KEY",
};

const PROFILE_BASE_URL_ENV: Record<string, string> = {
	deepseek: "DEEPSEEK_BASE_URL",
	kimi: "MOONSHOT_BASE_URL",
	qwen: "DASHSCOPE_BASE_URL",
	glm: "ZHIPU_BASE_URL",
	amd: "AI_API_URL",
};

const PROFILE_MODEL_ENV: Record<string, string> = {
	amd: "AI_MODEL",
};

function safePositiveNumber(value: string): number | undefined {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Resolve provider settings from flags, falling back to environment variables. */
export function resolveConfig(flags: CliFlags, env: NodeJS.ProcessEnv = process.env): RunConfig {
	const profileName = typeof flags.profile === "string" ? flags.profile.toLowerCase() : undefined;
	const profile = profileName ? PROVIDER_PROFILES[profileName] : undefined;

	const apiFlag = typeof flags.api === "string" ? (flags.api.toLowerCase() as ApiKind) : undefined;
	const api: ApiKind =
		apiFlag === "anthropic-messages" || apiFlag === "openai-completions"
			? apiFlag
			: flags.api === "anthropic" || flags.api === "claude"
				? "anthropic-messages"
				: profile?.api ?? "openai-completions";

	const provider = typeof flags.provider === "string" ? flags.provider : profile?.provider ?? DEFAULT_MODELS[api].provider;
	const profileKeyEnv = profile ? PROFILE_KEY_ENV[profileName ?? ""] : undefined;
	const profileBaseUrlEnv = profile ? PROFILE_BASE_URL_ENV[profileName ?? ""] : undefined;
	const profileModelEnv = profile ? PROFILE_MODEL_ENV[profileName ?? ""] : undefined;
	const model =
		(typeof flags.model === "string" && flags.model) ||
		(profileModelEnv ? env[profileModelEnv] : undefined) ||
		profile?.id ||
		DEFAULT_MODELS[api].id;

		const thinkingDisabled =
		flags["no-thinking"] === true ||
		flags["no-thinking"] === "true" ||
		flags["no-thinking"] === "" ||
		flags.thinking === false ||
		flags.thinking === "false";

	return {
		api,
		provider,
		model,
		thinking: thinkingDisabled ? false : true,
		apiKey:
			(typeof flags["api-key"] === "string" && flags["api-key"]) ||
			(profileKeyEnv ? env[profileKeyEnv] : undefined) ||
			(api === "anthropic-messages" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY) ||
			undefined,
		baseUrl:
			(typeof flags["base-url"] === "string" && flags["base-url"]) ||
			(profileBaseUrlEnv ? env[profileBaseUrlEnv] : undefined) ||
			(api === "anthropic-messages" ? env.ANTHROPIC_BASE_URL : env.OPENAI_BASE_URL) ||
			profile?.baseUrl ||
			undefined,
		maxTokens: typeof flags["max-tokens"] === "string" ? safePositiveNumber(flags["max-tokens"]) : undefined,
		maxContextTokens:
			typeof flags["max-context-tokens"] === "string"
				? safePositiveNumber(flags["max-context-tokens"])
				: undefined,
		maxTurns: typeof flags["max-turns"] === "string" ? safePositiveNumber(flags["max-turns"]) : undefined,
		logDir: typeof flags["log-dir"] === "string" && flags["log-dir"] ? flags["log-dir"] : undefined,
		logRetentionDays:
			typeof flags["log-retention"] === "string" ? safePositiveNumber(flags["log-retention"]) : undefined,
		sessionDir: typeof flags["session-dir"] === "string" && flags["session-dir"] ? flags["session-dir"] : undefined,
	};
}

/** Build a {@link Model} object from a {@link RunConfig}. */
export function modelFromConfig(config: RunConfig): Model {
	return {
		id: config.model,
		api: config.api,
		provider: config.provider,
		baseUrl: config.baseUrl,
		maxTokens: config.maxTokens,
		thinking: config.thinking,
	};
}

export const DEFAULT_SYSTEM_PROMPT = [
	"You are a helpful coding agent working inside a project directory.",
	"Stay focused on the user's current request: solve the actual task, do not expand scope, brainstorm, or over-explain.",
	"Prefer making verification (tests, type checks) part of your workflow.",
	"Use tools to read files before editing them, and keep changes minimal and reviewable.",
	"When executing commands, prefer the tools provided over raw shell where possible.",
	"For genuinely multi-step tasks, plan with the todowrite tool and keep the list current as you work.",
	"For large, self-contained chunks of work (e.g., reviewing a whole directory or module, running a full audit), delegate them with the task tool instead of doing everything inline — it keeps the main conversation lean and within turn limits.",
].join("\n");