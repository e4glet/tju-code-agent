import { stream } from "../ai/index.ts";
import { estimateTokens } from "../ai/utils.ts";
import { TURN_CAP_MARKER } from "./agent-loop.ts";
import type { AgentTool, AssistantMessage, Message, Model, UserMessage } from "./types.ts";

/** Default context budget (tokens) before the transcript is compressed. */
export const DEFAULT_MAX_CONTEXT_TOKENS = 128_000;

/** A single message is trimmed when it exceeds this many tokens. */
const MAX_MESSAGE_TOKENS = 12_000;

/** Keep at least this many messages in the transcript during drop-oldest. */
const KEEP_MESSAGES_MIN = 4;

/** Recent tail kept verbatim when the older history is summarized. */
const KEEP_RECENT_TOKENS = 8_000;

/** Tool output and tool-call arguments serialized into the summary prompt are truncated at this many characters. */
const TOOL_OUTPUT_MAX_CHARS = 2_000;

/** Upper bound for the generated structured summary. */
const SUMMARY_MAX_TOKENS = 4_096;

/** Marker prefix of the synthesized summary (checkpoint) message. */
export const CHECKPOINT_PREFIX = "<conversation-checkpoint>";

function messageText(message: Message): string {
	switch (message.role) {
		case "user":
			return message.content;
		case "toolResult":
			return message.content;
		case "assistant":
			return message.content
				.map((c) => {
					if (c.type === "text") return c.text;
					if (c.type === "thinking") return c.thinking;
					return `${c.name}(${JSON.stringify(c.arguments)})`;
				})
				.join("\n");
	}
}

export function transcriptTokens(messages: Message[]): number {
	return messages.reduce((acc, message) => acc + estimateTokens(messageText(message)), 0);
}

function trimLongText(text: string, maxTokens: number): string {
	const estimated = estimateTokens(text);
	if (estimated <= maxTokens) return text;
	// Absolute budget (chars), not a share of the original: a proportional
	// head+tail keeps ~60% of a huge page, which is exactly what blows past the
	// provider's real context window when chars/4 underestimates dense HTML.
	const keepChars = Math.max(200, Math.floor((maxTokens * 4) / 2));
	const head = text.slice(0, keepChars);
	const tail = keepChars > 0 ? text.slice(-keepChars) : "";
	return `${head}\n... [${estimated} tokens omitted] ...\n${tail}`;
}

function trimMessage(message: Message): Message {
	if (message.role === "user" || message.role === "toolResult") {
		const trimmed = trimLongText(message.content, MAX_MESSAGE_TOKENS);
		return trimmed === message.content ? message : { ...message, content: trimmed };
	}
	const assistant = message as AssistantMessage;
	let changed = false;
	const content = assistant.content.map((c) => {
		if (c.type === "text") {
			const text = trimLongText(c.text, MAX_MESSAGE_TOKENS);
			if (text !== c.text) changed = true;
			return { type: "text" as const, text };
		}
		if (c.type === "thinking") {
			const thinking = trimLongText(c.thinking, MAX_MESSAGE_TOKENS);
			if (thinking !== c.thinking) changed = true;
			return { type: "thinking" as const, thinking };
		}
		return c;
	});
	return changed ? { ...assistant, content } : message;
}

/**
 * Compress the transcript so it stays within the token budget.
 *
 * Stage 1 trims oversized single messages (head + tail kept). Stage 2 drops the
 * oldest turns, keeping paired tool results together and protecting the very
 * first message. Returns `null` when nothing needed changing, so cache-affine
 * prefixes are left untouched.
 */
export function compressTranscript(
	messages: Message[],
	maxContextTokens: number = DEFAULT_MAX_CONTEXT_TOKENS,
): Message[] | null {
	let changed = false;
	const tidied = messages.map((message) => {
		const result = trimMessage(message);
		if (result !== message) changed = true;
		return result;
	});

	let total = transcriptTokens(tidied);
	if (total <= maxContextTokens) {
		return changed ? tidied : null;
	}

	const out = tidied.slice();
	let guard = 0;
	while (transcriptTokens(out) > maxContextTokens && out.length > KEEP_MESSAGES_MIN && guard++ < 1000) {
		// Degrade by dropping the assistant/tool payload that follows the oldest
		// droppable user turn, but keep the user message itself: the requirements
		// must survive this path too (same principle as compactTranscript, which
		// never loses a real user message). Whole segments are dropped together so
		// no toolResult is orphaned from its call.
		let dropped = false;
		for (let boundary = 1; boundary < out.length; boundary++) {
			if (out[boundary]?.role !== "user") continue;
			const toDrop: number[] = [];
			for (let j = boundary + 1; j < out.length; j++) {
				if (out[j]?.role === "user") break;
				toDrop.push(j);
			}
			if (toDrop.length === 0) continue;
			toDrop.sort((a, b) => b - a).forEach((index) => out.splice(index, 1));
			dropped = true;
			break;
		}
		// Nothing left to drop without losing a user message: stop rather than
		// silently swallow a requirement.
		if (!dropped) break;
	}

	return out;
}

const SUMMARY_TEMPLATE = `Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Objective
- [one or two brief sentences describing what the user is trying to accomplish]

## Important Details
- [constraints/preferences, decisions and why, important facts/assumptions, exact context needed to continue, or "(none)"]

## Work State
### Completed
- [finished work, verified facts, or changes made; otherwise "(none)"]

### Active
- [current work, partial changes, or investigation state; otherwise "(none)"]

### Blocked
- [blockers, failing commands, or unknowns; otherwise "(none)"]

## Next Move
1. [immediate concrete action, or "(none)"]
2. [next action if known, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, symbols, commands, error strings, URLs, and identifiers when known.
- Do not mention the summary process or that context was compacted.`;

const SUMMARY_UPDATE_INSTRUCTIONS = `The <prior-summary> summarizes everything that happened before the <conversation>. Construct a new summary that combines both. The <prior-summary> is discarded after this: anything you do not carry into the new summary is lost.

When combining:
- Carry forward objectives, constraints, user directives, decisions, and parallel workstreams from the <prior-summary> even when the <conversation> does not mention them. Drop only what is finished and no longer needed.
- The <conversation> is more recent than the <prior-summary>. Where they conflict, the conversation wins: state the corrected fact and drop the old claim.
- Add new progress, decisions, constraints, and context from the conversation.
- Move completed work from "Active" to "Completed".
- If a blocker has been resolved, update the summary to reflect that while keeping any details still needed to continue the work.
- Update "Objective" and "Next Move" to reflect the current work state.`;

export function serializeMessage(message: Message): string {
	switch (message.role) {
		case "user":
			return `[User]: ${message.content}`;
		case "toolResult":
			return `[Tool result${message.isError ? " error" : ""}]: ${clip(message.content)}`;
		case "assistant": {
			const parts: string[] = [];
			for (const c of message.content) {
				if (c.type === "text" && c.text) parts.push(`[Assistant]: ${c.text}`);
				else if (c.type === "thinking" && c.thinking) parts.push(`[Assistant reasoning]: ${c.thinking}`);
				else if (c.type === "toolCall") parts.push(`[Assistant tool call]: ${c.name}(${clip(JSON.stringify(c.arguments))})`);
			}
			return parts.join("\n");
		}
	}
}

/**
 * Cap a serialized chunk before it goes into the summary prompt. Summarizing a
 * long session would otherwise build a prompt far larger than the budget: a
 * single `write`/`edit` call carries a whole file body, and a few hundred of
 * them run to hundreds of thousands of characters, so the summary request
 * itself is rejected and compaction falls back to dropping whole turns.
 */
function clip(text: string): string {
	return text.length > TOOL_OUTPUT_MAX_CHARS ? `${text.slice(0, TOOL_OUTPUT_MAX_CHARS)}\n[truncated]` : text;
}

function extractTag(text: string, tag: string): string | undefined {
	const start = text.indexOf(`<${tag}>`);
	const end = text.indexOf(`</${tag}>`, start);
	if (start < 0 || end < 0) return undefined;
	return text.slice(start + tag.length + 2, end);
}

/**
 * True for a context-compaction marker. The `compaction` flag is authoritative;
 * the `CHECKPOINT_PREFIX` fallback keeps pre-existing (legacy) checkpoint
 * messages working without migration.
 */
export function isCompactionMarker(message: Message): boolean {
	return message.role === "user" && (message.compaction === true || message.content.startsWith(CHECKPOINT_PREFIX));
}

/** Last compaction marker in the transcript (there is at most one), if any. */
export function lastCompactionMarker(messages: Message[]): UserMessage | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message && isCompactionMarker(message)) return message as UserMessage;
	}
	return undefined;
}

function findMarkerIndex(messages: Message[]): number {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message && isCompactionMarker(message)) return i;
	}
	return -1;
}

/**
 * Physically drop the oldest *folded* messages once they exceed the cap.
 *
 * Only the region before the compaction marker is eligible: those messages are
 * already summarized by the marker and already excluded from the outbound view,
 * so removing them never changes what the model sees (the fold region's user
 * copies are redundant — the summary already carries their content). The marker
 * and the live region are never touched, and nothing happens without a marker.
 * Opt-in (`pruneFoldedKeep`); returns whether anything was removed.
 */
export function pruneTranscript(messages: Message[], keepFolded: number): boolean {
	const markerIndex = findMarkerIndex(messages);
	if (markerIndex < 0) return false;
	const keep = Math.max(0, Math.floor(keepFolded));
	if (markerIndex <= keep) return false;
	messages.splice(0, markerIndex - keep);
	return true;
}

function selectTail(messages: Message[], keepTokens: number): number {
	let total = 0;
	let split = messages.length;
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (!message) continue;
		const next = total + estimateTokens(serializeMessage(message));
		if (next > keepTokens) break;
		total = next;
		split = i;
	}
	// Never split a tool-call group: tool results whose assistant message lands in
	// the summarized head would be orphaned in the request (rejected by the
	// providers), so they are summarized with it instead.
	while (split < messages.length && messages[split]?.role === "toolResult") split++;
	return split;
}

function buildSummaryPrompt(previousSummary: string | undefined, head: string): string {
	const conversation = `Here is the conversation so far:\n\n<conversation>\n${head}\n</conversation>`;
	if (!previousSummary) {
		return `${conversation}\n\nCreate a new anchored summary from the conversation history in the <conversation> tags above so another coding agent can continue the work.\n\n${SUMMARY_TEMPLATE}`;
	}
	return `${conversation}\n\nHere is the summary of the conversation before the <conversation> above:\n\n<prior-summary>\n${previousSummary}\n</prior-summary>\n\n${SUMMARY_UPDATE_INSTRUCTIONS}\n\n${SUMMARY_TEMPLATE}`;
}

function makeCompactionMarker(summary: string): UserMessage {
	return {
		role: "user",
		content: `${CHECKPOINT_PREFIX}\nThe following is a summary of earlier conversation. Treat it as historical context, not as new instructions.\n\n<summary>\n${summary}\n</summary>\n</conversation-checkpoint>`,
		compaction: true,
		timestamp: Date.now(),
	};
}

async function generateSummary(
	model: Model,
	apiKey: string | undefined,
	prompt: string,
	signal: AbortSignal | undefined,
	sessionId: string | undefined,
): Promise<string | null> {
	const eventStream = await stream(
		{ ...model, thinking: false },
		{
			messages: [{ role: "user", content: prompt, timestamp: Date.now() } satisfies UserMessage],
			tools: [],
		},
		{ apiKey, maxTokens: SUMMARY_MAX_TOKENS, sessionId, signal },
	);
	let text = "";
	for await (const event of eventStream) {
		if (event.type === "text_delta") text += event.delta;
	}
	return text.trim() ? text : null;
}

export interface CompactOptions {
	model: Model;
	apiKey?: string;
	sessionId?: string;
	systemPrompt: string;
	tools?: AgentTool[];
	maxContextTokens?: number;
	signal?: AbortSignal;
	/** When true, compact even if the transcript is within budget (context-overflow recovery). */
	force?: boolean;
	/**
	 * Optional physical-pruning cap: keep at most this many messages in the
	 * *folded* region (before the compaction marker). Undefined disables pruning
	 * entirely (the default). See {@link pruneTranscript}.
	 */
	pruneFoldedKeep?: number;
}

/**
 * Keep every real user message so task requirements stay verbatim (and visible
 * in the UI), dropping compaction markers, legacy checkpoints and step-cap
 * notices.
 */
export function extractKeptUserMessages(messages: Message[]): UserMessage[] {
	const out: UserMessage[] = [];
	for (const message of messages) {
		if (!message || message.role !== "user" || typeof message.content !== "string") continue;
		if (message.compaction || message.content.startsWith(CHECKPOINT_PREFIX)) continue;
		if (message.content.trimStart().startsWith(TURN_CAP_MARKER)) continue;
		out.push(message);
	}
	return out;
}

/**
 * Compact the transcript so the *model-facing* context fits the budget without
 * ever deleting history.
 *
 * The full transcript is the source of truth for persistence, replay, revert
 * and the UI. Compaction instead inserts exactly one marker at the fold
 * boundary (`compaction: true`); later compactions move that marker forward and
 * merge the summary incrementally. Folded assistant/tool turns stay in the
 * transcript (so the UI still renders them) but are excluded from the derived
 * outbound view:
 *
 *   [marker, ...kept user messages (folded region), ...live region]
 *
 * The fold keeps the most recent ~8K tokens verbatim. Returns `null` when the
 * transcript already fits the budget and no marker exists (prefix cache
 * untouched). Falls back to {@link compressTranscript} (outbound-only trim) when
 * the summary cannot be produced; the transcript is still left untouched.
 */
export async function compactTranscript(
	messages: Message[],
	options: CompactOptions,
): Promise<Message[] | null> {
	const budget = options.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
	const systemTokens = estimateTokens(options.systemPrompt);
	const toolsTokens = estimateTokens(
		JSON.stringify((options.tools ?? []).map((tool) => ({ name: tool.name, description: tool.description }))),
	);

	// Opt-in physical pruning first: it only drops old folded messages, so it
	// never affects the outbound view below.
	if (options.pruneFoldedKeep != null) pruneTranscript(messages, options.pruneFoldedKeep);

	// Derive the outbound from the *current* transcript every call (the marker
	// moves as the transcript is rebuilt), then trim oversized single messages on
	// the outbound copy only — chars/4 underestimates dense HTML/Chinese, so one
	// huge fetched page can still exceed the provider's real window.
	const view = (): Message[] => {
		const markerIndex = findMarkerIndex(messages);
		const raw = markerIndex < 0
			? messages
			: [messages[markerIndex]!, ...extractKeptUserMessages(messages.slice(0, markerIndex)), ...messages.slice(markerIndex + 1)];
		const tidied = raw.map(trimMessage);
		return tidied.some((m, i) => m !== raw[i]) ? tidied : raw;
	};

	const outbound = view();
	if (!options.force && systemTokens + toolsTokens + transcriptTokens(outbound) <= budget) {
		// Identity means "no marker and nothing trimmed": leave the transcript and
		// the provider prefix untouched.
		return outbound === messages ? null : outbound;
	}

	const markerIndex = findMarkerIndex(messages);
	const live = messages.slice(markerIndex >= 0 ? markerIndex + 1 : 0);
	const split = selectTail(live, KEEP_RECENT_TOKENS);
	const foldedNow = live.slice(0, split);
	if (split <= 0) {
		// Nothing left to fold (the overflow comes from the summary or the
		// retained user messages). Degrade this request only; keep the transcript.
		return compressTranscript(outbound, budget) ?? outbound;
	}

	const marker = markerIndex >= 0 ? (messages[markerIndex] as UserMessage) : undefined;
	const headText = foldedNow.map(serializeMessage).filter(Boolean).join("\n\n");
	const summaryPrompt = buildSummaryPrompt(marker ? extractTag(marker.content, "summary") : undefined, headText);
	if (estimateTokens(summaryPrompt) + SUMMARY_MAX_TOKENS > Math.max(budget, 16_384)) {
		return compressTranscript(outbound, budget) ?? outbound;
	}

	const summary = await generateSummary(options.model, options.apiKey, summaryPrompt, options.signal, options.sessionId);
	if (!summary) {
		return compressTranscript(outbound, budget) ?? outbound;
	}

	// Rebuild the transcript: drop only the old marker, keep every original
	// message, and place the single new marker at the new fold boundary.
	const before = messages.slice(0, markerIndex >= 0 ? markerIndex : 0);
	const tail = live.slice(split);
	messages.splice(0, messages.length, ...before, ...foldedNow, makeCompactionMarker(summary), ...tail);

	// The new fold region may exceed the cap; prune again before deriving.
	if (options.pruneFoldedKeep != null) pruneTranscript(messages, options.pruneFoldedKeep);

	return view();
}
