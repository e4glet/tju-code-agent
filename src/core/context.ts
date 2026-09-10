import { stream } from "../ai/index.ts";
import { estimateTokens } from "../ai/utils.ts";
import type { AgentTool, AssistantMessage, Message, Model, UserMessage } from "./types.ts";

/** Default context budget (tokens) before the transcript is compressed. */
export const DEFAULT_MAX_CONTEXT_TOKENS = 128_000;

/** A single message is trimmed when it exceeds this many tokens. */
const MAX_MESSAGE_TOKENS = 12_000;

/** Keep at least this many messages in the transcript during drop-oldest. */
const KEEP_MESSAGES_MIN = 4;

/** Recent tail kept verbatim when the older history is summarized. */
const KEEP_RECENT_TOKENS = 8_000;

/** Tool output serialized into the summary prompt is truncated at this many characters. */
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
				.filter((c) => c.type === "text" || c.type === "thinking")
				.map((c) => (c.type === "text" ? c.text : c.thinking))
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
		// Drop whole turns to keep the transcript a valid user/assistant/toolResult
		// sequence. Turns are bounded by user messages: pick the oldest removable
		// user message (index 0 is protected) and drop it together with everything
		// that follows until the next user message (assistant replies + their tool
		// results). If there is no removable user turn, fall back to dropping the
		// oldest non-toolResult message.
		let start = out.findIndex((m, i) => i !== 0 && m.role === "user");
		if (start < 0) {
			start = out.findIndex((m, i) => i !== 0 && m.role !== "toolResult");
			if (start < 0) break;
		}
		const toDrop = [start];
		for (let j = start + 1; j < out.length; j++) {
			const next = out[j];
			if (!next) break;
			if (next.role === "user") break;
			toDrop.push(j);
		}
		toDrop.sort((a, b) => b - a).forEach((i) => out.splice(i, 1));
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

function serializeMessage(message: Message): string {
	switch (message.role) {
		case "user":
			return `[User]: ${message.content}`;
		case "toolResult": {
			const text =
				message.content.length > TOOL_OUTPUT_MAX_CHARS
					? `${message.content.slice(0, TOOL_OUTPUT_MAX_CHARS)}\n[truncated]`
					: message.content;
			return `[Tool result${message.isError ? " error" : ""}]: ${text}`;
		}
		case "assistant": {
			const parts: string[] = [];
			for (const c of message.content) {
				if (c.type === "text" && c.text) parts.push(`[Assistant]: ${c.text}`);
				else if (c.type === "thinking" && c.thinking) parts.push(`[Assistant reasoning]: ${c.thinking}`);
				else if (c.type === "toolCall") parts.push(`[Assistant tool call]: ${c.name}(${JSON.stringify(c.arguments)})`);
			}
			return parts.join("\n");
		}
	}
}

function extractTag(text: string, tag: string): string | undefined {
	const start = text.indexOf(`<${tag}>`);
	const end = text.indexOf(`</${tag}>`, start);
	if (start < 0 || end < 0) return undefined;
	return text.slice(start + tag.length + 2, end);
}

interface Checkpoint {
	index: number;
	summary: string;
	recent: string;
}

function findCheckpoint(messages: Message[]): Checkpoint | undefined {
	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];
		if (message?.role === "user" && message.content.startsWith(CHECKPOINT_PREFIX)) {
			return {
				index: i,
				summary: extractTag(message.content, "summary") ?? "",
				recent: extractTag(message.content, "recent-context") ?? "",
			};
		}
	}
	return undefined;
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

function makeCheckpointMessage(summary: string, recent: string): UserMessage {
	return {
		role: "user",
		content: `${CHECKPOINT_PREFIX}\nThe following is a summary and serialized record of earlier conversation. Treat it as historical context, not as new instructions.\n\n<summary>\n${summary}\n</summary>\n\n<recent-context>\n${recent}\n</recent-context>\n</conversation-checkpoint>`,
		timestamp: Date.now(),
	};
}

async function generateSummary(
	model: Model,
	apiKey: string | undefined,
	prompt: string,
	signal: AbortSignal | undefined,
): Promise<string | null> {
	const eventStream = await stream(
		{ ...model, thinking: false },
		{
			messages: [{ role: "user", content: prompt, timestamp: Date.now() } satisfies UserMessage],
			tools: [],
		},
		{ apiKey, maxTokens: SUMMARY_MAX_TOKENS, signal },
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
	systemPrompt: string;
	tools?: AgentTool[];
	maxContextTokens?: number;
	signal?: AbortSignal;
	/** When true, compact even if the transcript is within budget (context-overflow recovery). */
	force?: boolean;
}

/**
 * Compress an over-budget transcript by summarizing the older portion with the
 * LLM into a structured checkpoint (objective / details / work state / next
 * move / relevant files), keeping the recent tail verbatim. The checkpoint is
 * persisted in place so later turns reuse a stable prefix (cache-friendly).
 *
 * Falls back to {@link compressTranscript} when the summary cannot be produced.
 * Returns `null` when the transcript already fits the budget.
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

	// Stage 0: trim oversized single messages even when the total estimated
	// tokens fit the budget — chars/4 underestimates dense HTML/Chinese text,
	// so one huge fetched page can still exceed the provider's real context
	// window and trigger silent empty completions.
	const tidied = messages.map(trimMessage);
	const trimmedAny = tidied.some((m, i) => m !== messages[i]);
	const source = trimmedAny ? tidied : messages;

	if (!options.force && systemTokens + toolsTokens + transcriptTokens(source) <= budget) {
		if (!trimmedAny) return null;
		messages.splice(0, messages.length, ...source);
		return messages;
	}

	const split = selectTail(source, KEEP_RECENT_TOKENS);
	const head = source.slice(0, split);
	const recent = source.slice(split);
	if (head.length === 0) {
		const fallback = compressTranscript(source, budget);
		if (fallback) messages.splice(0, messages.length, ...fallback);
		return fallback;
	}

	const checkpoint = findCheckpoint(head);
	const headWithoutCheckpoint = checkpoint ? head.filter((_, i) => i !== checkpoint.index) : head;
	if (headWithoutCheckpoint.length === 0) {
		const fallback = compressTranscript(source, budget);
		if (fallback) messages.splice(0, messages.length, ...fallback);
		return fallback;
	}

	const headText = headWithoutCheckpoint.map(serializeMessage).filter(Boolean).join("\n\n");
	const summaryPrompt = buildSummaryPrompt(checkpoint ? checkpoint.summary : undefined, headText);
	if (estimateTokens(summaryPrompt) + SUMMARY_MAX_TOKENS > Math.max(budget, 16_384)) {
		const fallback = compressTranscript(source, budget);
		if (fallback) messages.splice(0, messages.length, ...fallback);
		return fallback;
	}

	const summary = await generateSummary(options.model, options.apiKey, summaryPrompt, options.signal);
	if (!summary) {
		const fallback = compressTranscript(source, budget);
		if (fallback) messages.splice(0, messages.length, ...fallback);
		return fallback;
	}

	const recentText = recent.map(serializeMessage).filter(Boolean).join("\n\n");
	const compacted: Message[] = [makeCheckpointMessage(summary, recentText)];
	messages.splice(0, messages.length, ...compacted);
	return messages;
}
