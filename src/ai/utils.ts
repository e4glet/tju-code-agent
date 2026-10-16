import type { AssistantMessage, Attachment, Message, ToolResultMessage, UserMessage } from "../core/types.ts";
import { APP_VERSION } from "../version.ts";

const OPENCODE_HOST_RE = /(^|\.)opencode\.ai$/i;

function isOpencodeEndpoint(baseUrl: string | undefined): boolean {
	if (!baseUrl) return false;
	try {
		return OPENCODE_HOST_RE.test(new URL(baseUrl).hostname);
	} catch {
		return baseUrl.toLowerCase().includes("opencode.ai");
	}
}

export function affinityHeaders(baseUrl: string | undefined, sessionId: string | undefined): Record<string, string> {
	const headers: Record<string, string> = { "user-agent": `tju-code/${APP_VERSION}` };
	if (sessionId && isOpencodeEndpoint(baseUrl)) headers["x-opencode-session"] = sessionId;
	return headers;
}

/**
 * Repair an outbound transcript so every assistant turn is a shape the chat
 * APIs accept: an assistant message must carry text, thinking or tool calls,
 * and every tool call must be answered by a tool result.
 *
 * Aborting a run mid-stream leaves an assistant message behind whose content is
 * still empty, or whose tool calls were never executed. Providers reject both
 * shapes ("content or tool_calls must be set", "tool_calls must be followed by
 * tool messages"), which poisons every later request of the session. Empty
 * assistant turns and unanswered tool calls — plus the orphan tool results they
 * would otherwise pair with — are dropped here, at the single point where the
 * transcript is serialized, so a stopped conversation stays resumable.
 *
 * Untouched messages are returned as-is (same objects, same order) to keep the
 * provider prefix cache stable.
 */
export function sanitizeMessages(messages: Message[]): Message[] {
	const answered = new Set<string>();
	for (const message of messages) {
		if (message.role === "toolResult") answered.add(message.toolCallId);
	}

	const out: Message[] = [];
	const sent = new Set<string>();
	for (const message of messages) {
		if (message.role === "toolResult") {
			if (sent.has(message.toolCallId)) out.push(message);
			continue;
		}
		if (message.role !== "assistant") {
			out.push(message);
			continue;
		}
		const content = message.content.filter((c) => c.type !== "toolCall" || answered.has(c.id));
		if (content.length === 0) continue;
		for (const c of content) {
			if (c.type === "toolCall") sent.add(c.id);
		}
		out.push(content.length === message.content.length ? message : ({ ...message, content } as AssistantMessage));
	}
	return out;
}

/** Best-effort repair for streamed tool-call arguments. */
export function salvageJson(text: string): Record<string, unknown> {
	return parseJsonArguments(text) ?? {};
}

/**
 * Strict tool-argument parse. Returns `null` when the payload is not a JSON
 * object even after closing brace repair, so callers can refuse to execute the
 * tool call instead of running with empty guesses.
 */
export function parseJsonArguments(text: string): Record<string, unknown> | null {
	const trimmed = text.trim();
	if (!trimmed) {
		return null;
	}
	const accept = (parsed: unknown): parsed is Record<string, unknown> =>
		parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
	try {
		const parsed = JSON.parse(trimmed);
		return accept(parsed) ? parsed : null;
	} catch {
		// Try to close unclosed braces/brackets so a truncated chunk still yields
		// usable arguments.
		const open = (trimmed.match(/[\[{]/g) ?? []).length;
		const close = (trimmed.match(/[\]}]/g) ?? []).length;
		for (let i = 0; i < open - close; i++) {
			try {
				const parsed = JSON.parse(trimmed + "}".repeat(i + 1));
				if (accept(parsed)) return parsed;
			} catch {
				// keep trying
			}
		}
		return null;
	}
}

/** Rough token estimate used when the provider reports no usage. */
const CJK_RE = /[、-鿿぀-ヿ가-힯　-〿＀-￯𠀀-𪚺]/u;

export function estimateTokens(text: string): number {
	if (!text) return 0;
	let cjk = 0;
	let other = 0;
	for (const char of text) {
		if (CJK_RE.test(char)) cjk++;
		else other += char.length;
	}
	return Math.max(1, Math.ceil(cjk + other / 4));
}

export const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MIN_IMAGE_BYTES = 256 * 1024;
export const IMAGE_BUDGET_SHRINKS = 2;
export const TEXT_HEADROOM_BYTES = 4 * 1024 * 1024;

export interface ImageBudgetResult {
	messages: Message[];
	evicted: number;
}

function attachmentBase64Bytes(size: unknown): number {
	if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return Number.POSITIVE_INFINITY;
	return Math.ceil((size * 4) / 3);
}

export function applyImageBudget(messages: Message[], maxImageBytes: number): ImageBudgetResult {
	const budget = maxImageBytes > 0 ? maxImageBytes : DEFAULT_MAX_IMAGE_BYTES;
	const refs: Array<{ msg: number; att: number; bytes: number }> = [];
	messages.forEach((message, msg) => {
		if (message.role !== "user") return;
		(message.attachments ?? []).forEach((attachment: Attachment, att: number) => {
			if (attachment.kind !== "image") return;
			refs.push({ msg, att, bytes: attachmentBase64Bytes(attachment.size) });
		});
	});
	if (refs.length === 0) return { messages, evicted: 0 };
	let total = 0;
	for (const ref of refs) {
		total += ref.bytes;
		if (total > budget) break;
	}
	if (total <= budget) return { messages, evicted: 0 };
	const keep = new Set<number>();
	let used = 0;
	for (let i = refs.length - 1; i >= 0; i--) {
		const ref = refs[i]!;
		if (ref.bytes <= budget && used + ref.bytes <= budget) {
			keep.add(i);
			used += ref.bytes;
		}
	}
	const dropByMsg = new Map<number, number[]>();
	let evicted = 0;
	refs.forEach((ref, i) => {
		if (keep.has(i)) return;
		evicted++;
		const list = dropByMsg.get(ref.msg) ?? [];
		list.push(ref.att);
		dropByMsg.set(ref.msg, list);
	});
	if (evicted === 0) return { messages, evicted: 0 };
	const out = messages.map((message, msg) => {
		const drops = dropByMsg.get(msg);
		if (!drops || message.role !== "user") return message;
		const source = message as UserMessage;
		const dropSet = new Set(drops);
		const kept = (source.attachments ?? []).filter((_, att) => !dropSet.has(att));
		const names = drops.map((att) => source.attachments?.[att]?.name || "image");
		const note = `\n\n[Attached image${names.length > 1 ? "s" : ""} omitted to fit the request size budget: ${names.join(", ")}]`;
		return {
			...source,
			attachments: kept.length ? kept : undefined,
			content: source.content + note,
		};
	});
	return { messages: out, evicted };
}

/** Max characters of a historical tool-call argument JSON kept before the rest is dropped. */
export const HISTORY_TOOL_ARG_MAX_CHARS = 500;

/**
 * How many trailing tokens of the transcript keep full tool arguments and tool
 * results. Everything older is reduced: the call record, its id and its name
 * stay (providers require each call to be answered by exactly one result), only
 * the bulky payload is replaced by a placeholder.
 */
export const TOOL_BUDGET_KEEP_TOKENS = 8_000;

/**
 * How many distinct observed facts (one file slice each) may stay pinned outside
 * the aging window, and the total token budget for them. Sized as a *facts*
 * budget: roughly a third of the default 128K transcript budget, deliberately
 * larger than the 8K recent window because a read body is irreproducible while
 * everything else in the window is not. Measured working set of a "read every
 * file in one directory" pass is ~32k tokens, so a smaller cap guarantees
 * eviction — and eviction is what makes the model re-read. Past this budget the
 * least-recently read fact is tombstoned again, which is the intended signal to
 * switch to grep/`task` instead of holding everything at once.
 */
export const PINNED_READ_MAX = 32;

/** @see PINNED_READ_MAX */
export const PINNED_READ_BUDGET_TOKENS = 40_000;

const OMITTED_PATH_KEYS = ["path", "file", "filepath", "file_path"] as const;

/** File identity: the whole path, case-folded and slash-normalised. Two files
 * that merely share a basename are different facts — conflating them makes each
 * read evict the other's pinned body, which is what drives a re-read loop. */
function pathKey(raw: string): string {
	let path = raw.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
	if (path.startsWith("/?/")) path = path.slice(3);
	if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
	return path.toLowerCase();
}

/** Whether a tool argument names a location that carries its own directory. */
function isAbsolutePath(raw: string): boolean {
	return /^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith("\\") || raw.startsWith("/");
}

/** Basename, matched case-insensitively. Only used for a write path that carries
 * no directory: it cannot be matched against an absolute read path any other
 * way. Coarse on purpose — it can only make a read *more* likely to be called
 * stale, never less. */
function pathBase(raw: string): string {
	return (raw.replace(/\//g, "\\").split("\\").pop() ?? raw).toLowerCase();
}

/** The line span a `read` result covers, so two disjoint slices of one file stay
 * separate facts instead of evicting each other. */
function readRangeKey(
	message: ToolResultMessage,
	calls: ReadonlyMap<string, { name: string; args: Record<string, unknown> }>,
): string {
	const details = message.details as { startLine?: unknown; endLine?: unknown } | undefined;
	if (typeof details?.startLine === "number" && typeof details.endLine === "number") {
		return `${details.startLine}-${details.endLine}`;
	}
	const args = message.toolCallId ? calls.get(message.toolCallId)?.args : undefined;
	if (args) {
		const offset = typeof args.offset === "number" ? args.offset : 1;
		const limit = typeof args.limit === "number" ? args.limit : "*";
		return `${offset}-${limit}`;
	}
	return "*";
}

/** The path a `read` result came from: its own details first, else the call. */
function readResultPath(
	message: ToolResultMessage,
	calls: ReadonlyMap<string, { name: string; args: Record<string, unknown> }>,
): string | undefined {
	const details = message.details as { path?: unknown } | undefined;
	if (details && typeof details.path === "string" && details.path) return details.path;
	const args = message.toolCallId ? calls.get(message.toolCallId)?.args : undefined;
	if (args && typeof args.path === "string" && args.path) return args.path;
	return undefined;
}

/**
 * What an evicted tool result is replaced with. A bare placeholder makes the
 * model blindly re-fetch the whole file; naming the tool, the path argument
 * and the cleared size lets it re-fetch one slice (or obey the no-re-read
 * rule) instead.
 */
function clearedResultPlaceholder(
	message: ToolResultMessage,
	calls: ReadonlyMap<string, { name: string; args: Record<string, unknown> }>,
): string {
	const call = message.toolCallId ? calls.get(message.toolCallId) : undefined;
	const name = call?.name ?? message.toolName;
	const args = call?.args;
	let pathArg: string | undefined;
	if (args && typeof args === "object") {
		for (const key of OMITTED_PATH_KEYS) {
			const value = args[key];
			if (typeof value === "string" && value) {
				pathArg = value.length > 120 ? `${value.slice(0, 120)}…` : value;
				break;
			}
		}
	}
	const sizeKb = (message.content.length / 1024).toFixed(1);
	return pathArg ? `[Old tool result cleared: ${name} ${pathArg} (${sizeKb}KB)]` : `[Old tool result cleared: ${name} (${sizeKb}KB)]`;
}

/** Payload a message contributes to the retention window (its bulky parts only). */
function payloadText(message: Message): string {
	switch (message.role) {
		case "user":
			return "";
		case "toolResult":
			return message.content;
		case "assistant":
			return message.content
				.filter((c) => c.type === "toolCall")
				.map((c) => JSON.stringify(c.arguments))
				.join("\n");
	}
}

export interface ToolBudgetResult {
	messages: Message[];
	trimmedCalls: number;
	clearedResults: number;
}

/**
 * Tool results are split by whether the model could reproduce them:
 *
 * - **Observed facts** (`read`) are irreproducible: nothing but the file itself
 *   can regenerate them. Clearing one does not save a turn, it *costs* one —
 *   the model re-reads. They are therefore pinned out of the aging window for as
 *   long as the file has not been written since (a later `write`/`edit` makes the
 *   old body stale, and stale content is worse than a tombstone). The pinned set
 *   is capped by {@link PINNED_READ_MAX} / {@link PINNED_READ_BUDGET_TOKENS} so a
 *   hundred-file survey still cannot blow up the request.
 * - **Model-authored bulk** (a `write`/`edit` body the model itself produced) and
 *   **volatile command output** (`bash`, cheap to re-run) are aged out as before.
 *
 * Shrink the outbound copy of an old transcript without touching what is
 * persisted. A single `write`/`edit` call carries a whole file body, so a long
 * session sends hundreds of thousands of characters of arguments and results the
 * model no longer needs: it does not re-read a file it wrote an hour ago.
 *
 * Beyond the pinned facts, only the recent window is kept verbatim. Older tool
 * calls keep their id and name (the pairing providers validate) but lose the
 * argument JSON beyond a small prefix; older tool results are replaced by a
 * placeholder. User messages are never touched, so requirements stay visible.
 *
 * The cut is a pure function of the message list, so once the window scrolls the
 * prefix stays stable and prompt caching recovers on the next turn.
 */
export function applyToolBudget(messages: Message[], keepTokens = TOOL_BUDGET_KEEP_TOKENS): ToolBudgetResult {
	let total = 0;
	let split = messages.length;
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (!message) continue;
		// No message is ever dropped here, only trimmed, so a call and its result
		// can end up on opposite sides of the split without breaking the pairing
		// the providers validate.
		const next = total + estimateTokens(payloadText(message));
		if (next > keepTokens) break;
		total = next;
		split = i;
	}
	if (split === 0) return { messages, trimmedCalls: 0, clearedResults: 0 };

	let trimmedCalls = 0;
	let clearedResults = 0;
	let changed = false;
	const calls = new Map<string, { name: string; args: Record<string, unknown> }>();
	let lastTodoResult = -1;
	// Index of the last model write per file, so a read can be judged stale.
	// Writes that carry a directory match the exact file; a relative write has no
	// directory to resolve against, so it falls back to the basename.
	const lastWriteAt = new Map<string, number>();
	const lastWriteBaseAt = new Map<string, number>();
	const noteWrite = (raw: unknown, index: number): void => {
		if (typeof raw !== "string" || !raw) return;
		if (isAbsolutePath(raw)) lastWriteAt.set(pathKey(raw), index);
		else lastWriteBaseAt.set(pathBase(raw), index);
	};
	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];
		if (!message) continue;
		if (message.role === "assistant") {
			for (const c of message.content) {
				if (c.type !== "toolCall") continue;
				calls.set(c.id, { name: c.name, args: c.arguments });
				if (c.name === "apply_patch" && Array.isArray(c.arguments.operations)) {
					for (const op of c.arguments.operations) {
						if (op && typeof op === "object") noteWrite((op as { path?: unknown }).path, i);
					}
				} else if (c.name === "write" || c.name === "edit") {
					noteWrite(c.arguments.path, i);
				}
			}
		} else if (message.role === "toolResult" && message.toolName === "todowrite") {
			lastTodoResult = i;
		}
	}

	// Pin the newest still-fresh `read` result *per fact* (see the doc comment
	// above): one entry per (file, line span). Pin identity has to be as fine as
	// the fact itself, in both directions:
	//   - keying on the basename lets two same-named files in different
	//     directories evict each other — a model comparing `A\src\x.js` with
	//     `B\src\x.js` can then never hold both, and re-reads forever;
	//   - keying on the path alone lets the second slice of one large file evict
	//     the first, so reading a file in chunks also re-reads forever.
	// Re-reading a *whole* file only ever reproduces the same fact, so it still
	// collapses to one entry instead of pushing other files out.
	const pinnedReads = new Set<number>();
	const pinnedFacts = new Set<string>();
	let pinnedTokens = 0;
	for (let i = messages.length - 1; i >= 0 && pinnedFacts.size < PINNED_READ_MAX; i--) {
		const message = messages[i];
		if (!message || message.role !== "toolResult" || message.toolName !== "read" || !message.content) continue;
		const path = readResultPath(message, calls);
		if (!path) continue;
		const file = pathKey(path);
		const writtenAt = lastWriteAt.get(file);
		if (writtenAt !== undefined && writtenAt > i) continue;
		const baseWrittenAt = lastWriteBaseAt.get(pathBase(path));
		if (baseWrittenAt !== undefined && baseWrittenAt > i) continue;
		const fact = `${file}|${readRangeKey(message, calls)}`;
		if (pinnedFacts.has(fact)) continue;
		const tokens = estimateTokens(message.content);
		if (pinnedTokens + tokens > PINNED_READ_BUDGET_TOKENS) break;
		pinnedTokens += tokens;
		pinnedFacts.add(fact);
		pinnedReads.add(i);
	}

	const out = messages.map((message, index) => {
		if (index >= split) return message;
		if (message.role === "toolResult") {
			if (!message.content) return message;
			// The newest todowrite result is the plan of record: todowrite replaces
			// the whole list per call, so only the latest one is actionable and it
			// must stay visible for the model to advance statuses without clobbering.
			if (index === lastTodoResult) return message;
			// A fresh read result is the only copy of that file's content the model
			// has; clearing it forces a wasted re-read turn.
			if (pinnedReads.has(index)) return message;
			clearedResults++;
			changed = true;
			return { ...message, content: clearedResultPlaceholder(message, calls) };
		}
		if (message.role !== "assistant") return message;
		let touched = false;
		const content = message.content.map((c) => {
			if (c.type !== "toolCall") return c;
			const encoded = JSON.stringify(c.arguments);
			if (encoded.length <= HISTORY_TOOL_ARG_MAX_CHARS) return c;
			touched = true;
			trimmedCalls++;
			return { ...c, arguments: { _truncated: `${encoded.slice(0, HISTORY_TOOL_ARG_MAX_CHARS)}…`, _omittedChars: encoded.length - HISTORY_TOOL_ARG_MAX_CHARS } };
		});
		if (!touched) return message;
		changed = true;
		return { ...message, content };
	});
	if (!changed) return { messages, trimmedCalls: 0, clearedResults: 0 };
	return { messages: out, trimmedCalls, clearedResults };
}

export function describeOversizeBody(bodyBytes: number, evictedImages: number): string {
	const size = `${(bodyBytes / 1048576).toFixed(1)}MB`;
	const omitted = evictedImages > 0 ? `已自动省略 ${evictedImages} 张旧配图，` : `图片已全部省略，`;
	return `请求体过大（约 ${size}，网关拒绝 HTTP 413）。${omitted}仍超限：请新建工作项继续（推荐），或把对话回退到贴图之前，或换回包大小限制更宽松的接口；也可用 --max-image-bytes 调整图片预算。`;
}

/** Smallest reusable text helper used by adapters. */
export function contentText(
	content: Array<{ type: string; text?: string; thinking?: string }> | string,
): string {
	if (typeof content === "string") return content;
	return content
		.filter((c) => c.type === "text" || c.type === "thinking")
		.map((c) => c.text ?? c.thinking ?? "")
		.join("");
}

export class HttpError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly body: string,
	) {
		super(message);
	}
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function backoffMs(attempt: number): number {
	return Math.min(500 * 2 ** attempt, 5000);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function sleepAbortable(ms: number, signal?: AbortSignal | null): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException("Aborted", "AbortError"));
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = (): void => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			reject(new DOMException("Aborted", "AbortError"));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

/**
 * fetch with exponential backoff for transient failures: network errors and
 * retryable HTTP statuses (5xx, 429, 408). Config errors (400/401/403) and
 * exhausted retries return the last response so the caller can report it.
 */
export async function fetchWithRetry(
	url: string,
	init: RequestInit,
	retries = 3,
): Promise<Response> {
	let lastResponse: Response | undefined;
	for (let attempt = 0; attempt <= retries; attempt++) {
		if (init.signal?.aborted) {
			throw new DOMException("Aborted", "AbortError");
		}
		try {
			const response = await fetch(url, init);
			if (!RETRYABLE_STATUSES.has(response.status) || attempt === retries) {
				return response;
			}
			lastResponse = response;
		} catch (error) {
			lastResponse = undefined;
			if (init.signal?.aborted) throw error;
			if (attempt === retries) throw error;
		}
		await sleepAbortable(backoffMs(attempt), init.signal);
	}
	return lastResponse as Response;
}