import type { ApiKind, Model } from "./core/types.ts";
import { loadProviderTable, readSecrets } from "./providers.ts";

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
	/** Directory for persisted run event logs. Defaults to <data dir>/logs. */
	logDir?: string;
	/** Delete run logs older than this many days. Defaults to 7. */
	logRetentionDays?: number;
	/** Directory for persisted work items. Defaults to <data dir>/works. */
	sessionDir?: string;
	/** Base URL of the self-update static dir (latest.json). Flag --update-url or TJU_UPDATE_URL. Empty disables updates. */
	updateUrl?: string;
	/** Matched provider entry id, for restoring the interface per work item. */
	providerEntryId?: string;
	/** Non-fatal problems in the requested configuration (for example an unknown --profile value). */
	warnings?: string[];
}

const DEFAULT_MODELS: Record<ApiKind, { id: string; provider: string }> = {
	"openai-completions": { id: "gpt-4o-mini", provider: "openai" },
	"anthropic-messages": { id: "claude-sonnet-4-5", provider: "anthropic" },
};

/** One selectable model of a provider entry. */
export interface ProviderModel {
	id: string;
	/** Display label; falls back to the id. */
	label?: string;
	/** True once the vendor has retired this id. */
	deprecated?: boolean;
	/** Suggested replacement for a deprecated id. */
	replacedBy?: string;
}

/**
 * A provider preset: API kind, endpoint, key source and model catalogue.
 *
 * Built-in entries are the read-only fallback layer. A user-level layer
 * (a config file) is expected to override them by {@link ProviderEntry.id},
 * which is why every environment variable this entry reads and its model
 * catalogue are part of the entry instead of separate lookup tables.
 */
export interface ProviderEntry {
	/** Stable id, used by --profile and by the user-level override layer. */
	id: string;
	/** Display label for pickers. */
	label: string;
	api: ApiKind;
	/** Provider id reported to the adapters (also used for cache/telemetry). */
	provider: string;
	baseUrl: string;
	defaultModel: string;
	/** Environment variable holding this provider's API key. */
	keyEnv?: string;
	/** Environment variable overriding {@link baseUrl}. */
	baseUrlEnv?: string;
	/** Environment variable overriding {@link defaultModel}. */
	modelEnv?: string;
	/** Model catalogue; {@link defaultModel} is assumed when omitted. */
	models?: ProviderModel[];
	/** Set by the merge layer: builtin preset or user file override. */
	source?: "builtin" | "user";
}

/** One-key presets for common OpenAI-compatible providers. */
export const PROVIDER_ENTRIES: Record<string, ProviderEntry> = {
	deepseek: {
		id: "deepseek",
		label: "DeepSeek",
		api: "openai-completions",
		provider: "deepseek",
		baseUrl: "https://api.deepseek.com",
		defaultModel: "deepseek-v4-flash",
		keyEnv: "DEEPSEEK_API_KEY",
		baseUrlEnv: "DEEPSEEK_BASE_URL",
	},
	kimi: {
		id: "kimi",
		label: "Kimi",
		api: "openai-completions",
		provider: "moonshot",
		baseUrl: "https://api.moonshot.cn/v1",
		defaultModel: "kimi-k2.7-code",
		keyEnv: "MOONSHOT_API_KEY",
		baseUrlEnv: "MOONSHOT_BASE_URL",
	},
	qwen: {
		id: "qwen",
		label: "Qwen",
		api: "openai-completions",
		provider: "dashscope",
		baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		defaultModel: "qwen-max",
		keyEnv: "DASHSCOPE_API_KEY",
		baseUrlEnv: "DASHSCOPE_BASE_URL",
	},
	opencode: {
		id: "opencode",
		label: "OpenCode Go",
		api: "openai-completions",
		provider: "opencode",
		baseUrl: "https://opencode.ai/zen/go/v1",
		defaultModel: "deepseek-v4.1-flash",
		keyEnv: "OPENCODE_GO_API_KEY",
	},
	openai: {
		id: "openai",
		label: "OpenAI",
		api: "openai-completions",
		provider: "openai",
		baseUrl: "https://api.openai.com/v1",
		defaultModel: "gpt-6.1-sol",
		keyEnv: "OPENAI_API_KEY",
		baseUrlEnv: "OPENAI_BASE_URL",
	},
};

/** @deprecated Renamed to {@link ProviderEntry}. */
export type ProviderProfile = ProviderEntry;
/** @deprecated Renamed to {@link PROVIDER_ENTRIES}. */
export const PROVIDER_PROFILES: Record<string, ProviderEntry> = PROVIDER_ENTRIES;

/** Explicit values that take precedence over a provider entry (normally CLI flags). */
export interface ProviderOverrides {
	/** Provider entry id, for example the value of --profile. */
	id?: string;
	api?: string;
	provider?: string;
	model?: string;
	apiKey?: string;
	baseUrl?: string;
}

/** Concrete connection settings resolved from an entry plus overrides and environment. */
export interface ProviderResolution {
	/** The matched preset, when the requested id is known. */
	entry?: ProviderEntry;
	/** The requested entry id when it is not in the table. */
	unknownId?: string;
	api: ApiKind;
	provider: string;
	model: string;
	apiKey?: string;
	baseUrl?: string;
}

function parseApiKind(value: string | undefined): ApiKind | undefined {
	if (!value) return undefined;
	const lowered = value.toLowerCase();
	if (lowered === "anthropic-messages" || lowered === "anthropic" || lowered === "claude") {
		return "anthropic-messages";
	}
	if (lowered === "openai-completions") return "openai-completions";
	return undefined;
}

function safePositiveNumber(value: string): number | undefined {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Resolve provider connection settings from an optional preset id, explicit
 * overrides and the environment.
 *
 * Precedence: explicit override > entry environment variable > key stored for
 * the entry > generic OpenAI/Anthropic environment variable > entry default >
 * built-in default. An unknown entry id is reported through
 * {@link ProviderResolution.unknownId} rather than thrown, so callers can fall
 * back to the built-in defaults.
 *
 * `secrets` mirrors the per-entry keys kept in the local secrets file; it is a
 * plain map so this stays a pure function. The stored key has to sit above the
 * generic variable (rather than below) so runtime resolution agrees with the
 * `hasKey` flag the settings UI shows for an entry.
 */
export function resolveProvider(
	overrides: ProviderOverrides = {},
	env: NodeJS.ProcessEnv = process.env,
	table: Record<string, ProviderEntry> = PROVIDER_ENTRIES,
	secrets: Record<string, string> = {},
): ProviderResolution {
	const wanted = overrides.id ? overrides.id.toLowerCase() : undefined;
	const entry = wanted ? table[wanted] : undefined;

	const api = parseApiKind(overrides.api) ?? entry?.api ?? "openai-completions";
	const provider =
		overrides.provider !== undefined
			? overrides.provider
			: entry?.provider ?? DEFAULT_MODELS[api].provider;
	const model =
		overrides.model ||
		(entry?.modelEnv ? env[entry.modelEnv] : undefined) ||
		entry?.defaultModel ||
		DEFAULT_MODELS[api].id;
	const apiKey =
		overrides.apiKey ||
		(entry?.keyEnv ? env[entry.keyEnv] : undefined) ||
		(entry ? secrets[entry.id] : undefined) ||
		(api === "anthropic-messages" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY) ||
		undefined;
	const baseUrl =
		overrides.baseUrl ||
		(entry?.baseUrlEnv ? env[entry.baseUrlEnv] : undefined) ||
		(api === "anthropic-messages" ? env.ANTHROPIC_BASE_URL : env.OPENAI_BASE_URL) ||
		entry?.baseUrl ||
		undefined;

	return {
		entry,
		unknownId: wanted && !entry ? wanted : undefined,
		api,
		provider,
		model,
		apiKey,
		baseUrl,
	};
}

/** Resolve provider settings from flags, falling back to environment variables. */
export function resolveConfig(
	flags: CliFlags,
	env: NodeJS.ProcessEnv = process.env,
	table?: Record<string, ProviderEntry>,
	secrets?: Record<string, string>,
): RunConfig {
	const loaded = table ? { table, userIds: new Set<string>(), warnings: [] as string[] } : loadProviderTable(PROVIDER_ENTRIES);
	const resolved = resolveProvider(
		{
			id: typeof flags.profile === "string" ? flags.profile : undefined,
			api: typeof flags.api === "string" ? flags.api : undefined,
			provider: typeof flags.provider === "string" ? flags.provider : undefined,
			model: typeof flags.model === "string" ? flags.model : undefined,
			apiKey: typeof flags["api-key"] === "string" ? flags["api-key"] : undefined,
			baseUrl: typeof flags["base-url"] === "string" ? flags["base-url"] : undefined,
		},
		env,
		loaded.table,
		secrets ?? readSecrets(),
	);

	const warnings: string[] = [...loaded.warnings];
	if (resolved.unknownId) {
		warnings.push(
			`Unknown provider profile "${resolved.unknownId}". Known profiles: ${Object.keys(loaded.table).join(", ")}. Using ${resolved.provider}/${resolved.model}.`,
		);
	}

	const thinkingDisabled =
		flags["no-thinking"] === true ||
		flags["no-thinking"] === "true" ||
		flags["no-thinking"] === "" ||
		flags.thinking === false ||
		flags.thinking === "false";

	return {
		api: resolved.api,
		provider: resolved.provider,
		model: resolved.model,
		thinking: thinkingDisabled ? false : true,
		apiKey: resolved.apiKey,
		baseUrl: resolved.baseUrl,
		providerEntryId: resolved.entry?.id,
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
		updateUrl:
			(typeof flags["update-url"] === "string" && flags["update-url"]) || env.TJU_UPDATE_URL || undefined,
		warnings: warnings.length ? warnings : undefined,
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
	"Trust a successful tool result as ground truth; do not spend extra turns re-reading or re-verifying what a tool just confirmed.",
	"Do not re-read a file you already read unless it was modified since; use grep with context to inspect a known region instead.",
	"Use tools to read files before editing them, and keep changes minimal and reviewable.",
	"When executing commands, prefer the tools provided over raw shell where possible.",
	"Do not chain an action and its verification in one shell command with && (a failing check marks the whole call as failed); verify with a separate tool call afterwards.",
	"If progress is genuinely blocked by a decision you cannot reasonably make yourself, ask the user with the ask_user tool (up to 3 suggested options that are mutually exclusive and directly actionable, plus their own input, at most once per run); otherwise verify with tools and proceed with your best judgment.",
	"When several tool calls are independent of each other, issue them together in a single response so they run in parallel instead of one round-trip per call.",
	"For genuinely multi-step tasks, plan with the todowrite tool and keep the list current as you work.",
	"For large, self-contained chunks of work (e.g., reviewing a whole directory or module, running a full audit), delegate them with the task tool instead of doing everything inline — it keeps the main conversation lean and within turn limits.",
].join("\n");
