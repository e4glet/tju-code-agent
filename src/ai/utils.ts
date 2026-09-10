import type { AssistantMessage, Message } from "../core/types.ts";

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
export function estimateTokens(text: string): number {
	if (!text) return 0;
	return Math.max(1, Math.ceil(text.length / 4));
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
		await sleep(backoffMs(attempt));
	}
	return lastResponse as Response;
}