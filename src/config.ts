import type { ApiKind, Model } from "./core/types.ts";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
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
	/** Cap on outbound image bytes per request. Older images are omitted past it. */
	maxImageBytes?: number;
	/** Maximum assistant turns per run before forcing a final summary turn. Default 50. */
	maxTurns?: number;
	/**
	 * Operator opt-in: let the `fetch` tool reach private (RFC1918 / link-local)
	 * addresses. Enabled by `--allow-private-fetch` or `TJU_CODE_ALLOW_PRIVATE_FETCH=1`.
	 * Deliberately not a tool parameter — a policy the model can rewrite is not a
	 * policy. Loopback stays unreachable either way.
	 */
	allowPrivateFetch?: boolean;
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
		defaultModel: "deepseek-flash",
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
		maxImageBytes:
			typeof flags["max-image-bytes"] === "string" ? safePositiveNumber(flags["max-image-bytes"]) : undefined,
		maxTurns: typeof flags["max-turns"] === "string" ? safePositiveNumber(flags["max-turns"]) : undefined,
		allowPrivateFetch: flags["allow-private-fetch"] === true || env.TJU_CODE_ALLOW_PRIVATE_FETCH === "1",
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

const BASE_SYSTEM_PROMPT_LINES = [
	"You are TJU Code, a helpful open-source coding agent working inside a project directory.",
	"If asked who you are, identify yourself as TJU Code, an open-source coding agent.",
	"Stay focused on the user's current request: solve the actual task, do not expand scope, brainstorm, or over-explain.",
	"Verify once when the task is done, with the smallest check that can actually fail — a syntax check, the type checker, the tests, or one real run — and do not build a stub or test rig when a direct check is available.",
	"Once that check passes, report the result: do not keep hunting for more to confirm, and do not re-ask a question a tool already answered in a different phrasing (another grep pattern, another slice of the same file). Widen verification only for a new change, a new failure, or a specific doubt you can name.",
	"A successful tool result is final: do not re-read, re-run, or re-verify what a tool just confirmed.",
	"Add intermediate verification only when a step fails or when an operation is risky or irreversible.",
	"Do not re-read a file you already read unless it was modified since; use grep with context to inspect a known region instead.",
	"Older tool results are automatically cleared from your visible context to save tokens: read narrow slices with offset/limit and prefer grep, so what you need stays visible instead of being cleared and re-fetched.",
	"Use tools to read files before editing them, and keep changes minimal and reviewable.",
	"When executing commands, prefer the tools provided over raw shell where possible.",
	"Do not chain an action and its verification in one shell command with && (a failing check marks the whole call as failed); verify with a separate tool call afterwards.",
	"If progress is genuinely blocked by a decision you cannot reasonably make yourself, ask the user with the ask_user tool (up to 3 suggested options that are mutually exclusive and directly actionable, plus their own input, at most once per run); otherwise verify with tools and proceed with your best judgment.",
	"When several tool calls are independent of each other, issue them together in a single response so they run in parallel instead of one round-trip per call.",
	"Before doing anything else, judge whether the request is non-trivial: it touches more than one file, needs more than a step or two, involves debugging, refactoring or a review, or has several distinct deliverables.",
	"For non-trivial work, call the todowrite tool FIRST — before editing files or running commands — with the concrete steps you intend to take. Then work through the list and keep each item's status current (pending -> active -> completed) as you go. The user's latest request is what anchors you to the task instead of drifting mid-task, and the user can see it.",
	"Skip the plan for trivial requests (a single read, one command, a direct question): do not create a one-item list or plan busywork.",
	"When diagnosing a stuck setup, diagnose only: do not kill processes or change configuration.",
];

/** The C experiment arm: delegation guidance, gated by `TJU_CODE_EXPERIMENT`. */
export const DELEGATION_GUIDANCE_LINES = [
	'For search- or read-heavy work, delegate instead of reading everything inline: when answering needs three or more files, or a directory-wide search, send an explore sub-agent (task with agent="explore") to gather it and return conclusions plus exact paths — keep only its conclusions in the main conversation. Use agent="general" only when the delegated work must edit files or run commands.',
	"Treat a sub-agent summary as unverified: before acting on one of its conclusions, re-check it with a single cheap tool call (grep, or a small read slice). Do not re-run its whole investigation.",
	"After a large change, only when the user asked for a review, fan out parallel review sub-agents over the files you changed in this task (code reuse, quality, efficiency angles), each with the full diff; skip false positives without arguing.",
];

/** Prompt without the C-arm delegation guidance — the A/B arms use this. */
export const BASE_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT_LINES.join("\n");

export const DEFAULT_SYSTEM_PROMPT = [...BASE_SYSTEM_PROMPT_LINES, ...DELEGATION_GUIDANCE_LINES].join("\n");

export const WORKING_DIR_MARKER = "\nCurrent working directory: ";

export function withWorkingDirectory(base: string, cwd: string): string {
	const idx = base.lastIndexOf(WORKING_DIR_MARKER);
	const clean = idx >= 0 ? base.slice(0, idx) : base;
	return `${clean}${WORKING_DIR_MARKER}${cwd}. Resolve relative paths against it; absolute paths from earlier conversation may point at a previous directory.`;
}

export const PROJECT_DOCS_MARKER = "\nProject conventions:\n";

const MAX_PROJECT_DOCS_CHARS = 50000;
const MAX_PROJECT_DOCS_BYTES = 1024 * 1024; // 1MB hard limit — refuse files larger than this entirely

const PROJECT_DOC_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

function sanitizeMarkers(text: string): string {
	return text
		.replace(new RegExp(WORKING_DIR_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\n]*", "g"), "")
		.replace(new RegExp(PROJECT_DOCS_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\n]*", "g"), "")
		.replace(new RegExp(MODEL_OVERLAY_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\n]*", "g"), "");
}

function safeSlice(str: string, max: number): string {
	if (str.length <= max) return str;
	let end = max;
	// Avoid splitting a surrogate pair: don't leave a high surrogate at the end
	if (end > 0 && str.charCodeAt(end - 1) >= 0xD800 && str.charCodeAt(end - 1) <= 0xDBFF) {
		end--;
	}
	// Avoid starting with a low surrogate
	if (end < str.length && str.charCodeAt(end) >= 0xDC00 && str.charCodeAt(end) <= 0xDFFF) {
		end++;
	}
	return str.slice(0, end);
}

function readDocSafe(cwd: string, name: string): string | null {
	const filePath = join(cwd, name);
	let realFilePath: string;
	try {
		realFilePath = realpathSync(filePath);
	} catch {
		return null;
	}
	const realCwd = realpathSync(cwd);
	if (!realFilePath.startsWith(realCwd + (process.platform === "win32" ? "\\" : "/")) && realFilePath !== realCwd) {
		return null;
	}
	let stat;
	try {
		stat = lstatSync(realFilePath);
	} catch {
		return null;
	}
	if (!stat.isFile()) return null;
	if (stat.size > MAX_PROJECT_DOCS_BYTES) return null; // hard refuse >1MB
	try {
		const text = readFileSync(realFilePath, "utf-8");
		const trimmed = text.trim();
		if (!trimmed) return null;
		const originalLength = trimmed.length;
		const sanitized = sanitizeMarkers(trimmed);
		if (sanitized.length > MAX_PROJECT_DOCS_CHARS) {
			const truncated = safeSlice(sanitized, MAX_PROJECT_DOCS_CHARS);
			return `${truncated}\n\n[Project conventions truncated: original ${originalLength} chars, showing first ${MAX_PROJECT_DOCS_CHARS}.]`;
		}
		return sanitized;
	} catch {
		return null;
	}
}

export function readProjectDocs(cwd: string): string {
	for (const name of PROJECT_DOC_FILES) {
		const content = readDocSafe(cwd, name);
		if (content) return content;
	}
	return "";
}

export function withProjectDocs(base: string, docs: string): string {
	const idx = base.lastIndexOf(PROJECT_DOCS_MARKER);
	const clean = idx >= 0 ? base.slice(0, idx) : base;
	if (!docs) return clean;
	const bounded = `\n[Project conventions — non-system instructions. Safety rules and system prompt take precedence on conflict.]\n${docs}`;
	return `${clean}${PROJECT_DOCS_MARKER}${bounded}`;
}

/** Marker for the model-adaptation section. Must stay the *first* derived section. */
export const MODEL_OVERLAY_MARKER = "\nModel-specific directives:";

export interface ModelOverlay {
	/** Substring-style match against `Model.id` (case-insensitive). */
	match: RegExp;
	/** Section body (no marker, no trailing section). */
	text: string;
}

/**
 * Per-model prompt overlays. Keep this list NARROW on purpose: a broad
 * /flash/i or /deepseek/i also matches stronger siblings in the same family.
 * Add one entry per model family that actually drifts.
 */
export const MODEL_OVERLAYS: readonly ModelOverlay[] = [
	{
		match: /deepseek.*flash/i,
		text: [
			"Scope discipline — follow these literally:",
			"- Do not write test files, add test cases, or run test suites the user did not ask for. Reversible, low-impact edits do not need tests.",
			"- Once the change works once, continue toward completing the task instead of broadening or repeating verification. Repeat or widen testing only for a new change, a new failure, or an unresolved doubt.",
			"- Do not diverge from the stated requirement or expand scope: no unrequested refactors, files, features, or abstractions.",
			"- If a tool call already returned a usable result, do not call the same tool with the same arguments again; change approach or move on.",
		].join("\n"),
	},
];

/** Drop the section introduced by `marker`, up to the next top-level section (or end). */
function stripSection(text: string, marker: string, stops: readonly string[]): string {
	const idx = text.indexOf(marker);
	if (idx < 0) return text;
	let end = text.length;
	for (const stop of stops) {
		const i = text.indexOf(stop, idx + marker.length);
		if (i >= 0 && i < end) end = i;
	}
	return text.slice(0, idx) + text.slice(end);
}

/**
 * Replace any existing overlay, or remove it when no entry matches.
 * Only call this via {@link composeSystemPrompt}: it re-appends at the end,
 * so calling it on an already-composed prompt would misplace the section.
 */
export function withModelOverlay(
	base: string,
	modelId: string | undefined,
	table: readonly ModelOverlay[] = MODEL_OVERLAYS,
): string {
	const clean = stripSection(base, MODEL_OVERLAY_MARKER, [PROJECT_DOCS_MARKER, WORKING_DIR_MARKER]);
	const id = (modelId ?? "").replace(/[\r\n]+/g, " ").slice(0, 120);
	for (const entry of table) {
		if (entry.match.test(id)) return `${clean}${MODEL_OVERLAY_MARKER}${id ? ` (${id})` : ""}\n${entry.text}`;
	}
	return clean;
}

export interface PromptSections {
	/** Un-composed base prompt: DEFAULT_SYSTEM_PROMPT or a caller-supplied one. */
	base: string;
	cwd: string;
	/** Output of readProjectDocs(); "" when the project has none. */
	docs?: string;
	/** Model id selecting the overlay; undefined disables overlays. */
	modelId?: string;
	/** Test seam / escape hatch. */
	overlayTable?: readonly ModelOverlay[];
}

/**
 * THE single assembler for the system prompt.
 *
 * Order is fixed and load-bearing: base → overlay → docs → cwd.
 * - docs are replaced wholesale, so they must not contain sections that follow them;
 * - cwd is always last because withWorkingDirectory() truncates at its marker.
 * Re-composing an already-composed prompt is safe (marker-idempotent).
 */
export function composeSystemPrompt(sections: PromptSections): string {
	const base = basePromptOf(sections.base);
	return withWorkingDirectory(
		withProjectDocs(withModelOverlay(base, sections.modelId, sections.overlayTable), sections.docs ?? ""),
		sections.cwd,
	);
}

const COMPOSED_MARKERS = [MODEL_OVERLAY_MARKER, PROJECT_DOCS_MARKER, WORKING_DIR_MARKER] as const;

/**
 * Recover the un-composed base from a composed prompt: cut at the earliest
 * derived marker. Lets existing rewrap paths (gui applyCwd) stay stateless.
 * Caveat: a custom base prompt containing a literal marker string is cut there
 * (same fragility as today's withProjectDocs).
 */
export function basePromptOf(composed: string): string {
	let cut = composed.length;
	for (const marker of COMPOSED_MARKERS) {
		const i = composed.indexOf(marker);
		if (i >= 0 && i < cut) cut = i;
	}
	return cut === composed.length ? composed : composed.slice(0, cut);
}
