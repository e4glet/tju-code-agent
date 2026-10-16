import type { AssistantMessage, Message, Usage } from "../core/types.ts";
import { EventStream } from "../core/event-stream.ts";
import { normalizeReasoningEffort, type ReasoningEffort } from "../core/reasoning-effort.ts";
import { readSse } from "./sse.ts";
import { affinityHeaders, applyImageBudget, applyToolBudget, DEFAULT_MAX_IMAGE_BYTES, describeOversizeBody, estimateTokens, fetchWithRetry, HttpError, IMAGE_BUDGET_SHRINKS, MIN_IMAGE_BYTES, parseJsonArguments, sanitizeMessages, TEXT_HEADROOM_BYTES } from "./utils.ts";
import type { Context, GroundEvent, ProviderAdapter, ProviderStreamOptions } from "./types.ts";

type OpenAiChunk = {
	choices?: Array<{
		delta?: {
			content?: string | null;
			reasoning_content?: string | null;
			tool_calls?: Array<{
				index?: number;
				id?: string;
				function?: { name?: string; arguments?: string };
			}>;
		};
		finish_reason?: string | null;
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		prompt_cache_hit_tokens?: number;
		prompt_cache_miss_tokens?: number;
		prompt_tokens_details?: { cached_tokens?: number };
	} | null;
	// Some relays/gateways report upstream failures as a 200 stream whose
	// payload is a bare {"error": {...}} object instead of a proper HTTP error.
	error?: { message?: string; type?: string; code?: string | number } | string | null;
};

async function toOpenAiMessages(context: Context, imageBudget: number): Promise<{ messages: unknown[]; evicted: number }> {
	const { resolveAttachment } = context;
	const budgeted = applyImageBudget(applyToolBudget(sanitizeMessages(context.messages)).messages, imageBudget);
	const messages = budgeted.messages;
	// OpenAI-compatible endpoints carry the system prompt as the first message of
	// the same array (there is no dedicated `system` field like Anthropic's).
	// Omitting it silently dropped the entire system prompt — tool discipline,
	// project docs, the working directory — for every OpenAI-style provider.
	const out: unknown[] = context.systemPrompt ? [{ role: "system", content: context.systemPrompt }] : [];
	for (const m of messages) {
		switch (m.role) {
			case "user": {
				// A user message may carry image attachments for multimodal models.
				// When the host provides a resolver we emit the standard OpenAI
				// content-block array (text + image_url data URLs); otherwise the
				// attachments are ignored and the plain text is sent unchanged.
				const text = m.content;
				const images = (m.attachments ?? []).filter((a) => a.kind === "image");
				if (images.length && resolveAttachment) {
					const blocks: unknown[] = [];
					if (text) blocks.push({ type: "text", text });
					for (const image of images) {
						const bytes = await resolveAttachment(image).catch(() => null);
						if (!bytes) continue;
						const dataUrl = `data:${image.mime || "image/png"};base64,${Buffer.from(bytes).toString("base64")}`;
						blocks.push({ type: "image_url", image_url: { url: dataUrl } });
					}
					if (blocks.length === 1 && text) {
						out.push({ role: "user", content: text });
					} else if (blocks.length > 0) {
						out.push({ role: "user", content: blocks });
					} else {
						out.push({ role: "user", content: text });
					}
				} else {
					out.push({ role: "user", content: text });
				}
				break;
			}
			case "assistant": {
				const text = m.content
					.filter((c) => c.type === "text")
					.map((c) => c.text)
					.join("\n");
				const thinking = m.content
					.filter((c) => c.type === "thinking")
					.map((c) => c.thinking)
					.join("\n");
				const toolCalls = m.content
					.filter((c): c is typeof m.content[number] & { type: "toolCall" } => c.type === "toolCall")
					.map((c) => ({
						id: c.id,
						type: "function",
						function: { name: c.name, arguments: JSON.stringify(c.arguments) },
					}));
				const content: string | null = text
					? text
					: toolCalls.length
						? ""
						: thinking
							? `<thinking>\n${thinking}\n</thinking>`
							: null;
				out.push({
					role: "assistant",
					content,
					tool_calls: toolCalls.length ? toolCalls : undefined,
				});
				break;
			}
			case "toolResult":
				out.push({ role: "tool", tool_call_id: m.toolCallId, name: m.toolName, content: m.content });
				break;
			default:
				break;
		}
	}
	return { messages: out, evicted: budgeted.evicted };
}

function buildTools(context: Context): unknown[] | undefined {
	if (!context.tools?.length) {
		return undefined;
	}
	return context.tools.map((t) => ({
		type: "function",
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters ?? undefined,
		},
	}));
}

const EMPTY_COMPLETION_PROMPT_TOKENS = 10;

async function runStream(
	stream: EventStream<GroundEvent>,
	model: { id: string; provider: string; baseUrl?: string; maxTokens?: number; thinking?: boolean; reasoningEffort?: ReasoningEffort },
	context: Context,
	options: ProviderStreamOptions | undefined,
): Promise<void> {
	const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
	if (!apiKey) {
		stream.push({
			type: "error",
			message: {
				role: "assistant",
				content: [],
				api: "openai-completions",
				provider: model.provider,
				model: model.id,
				usage: { input: 0, output: 0, totalTokens: 0 },
				stopReason: "error",
				errorMessage: "OPENAI_API_KEY is not set",
				timestamp: Date.now(),
			},
		});
		stream.end();
		return;
	}

	const baseUrl = (options?.baseUrl ?? model.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
	let imageBudget = options?.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
	if (!(imageBudget > 0)) imageBudget = DEFAULT_MAX_IMAGE_BYTES;
	let evictedImages = 0;

	const pushError = (errorMessage: string, stopReason: "error" | "aborted" = "error"): void => {
		stream.push({
			type: "error",
			message: {
				role: "assistant",
				content: [],
				api: "openai-completions",
				provider: model.provider,
				model: model.id,
				usage: { input: 0, output: 0, totalTokens: 0 },
				stopReason,
				errorMessage,
				timestamp: Date.now(),
			},
		});
		stream.end();
	};

	try {
		let started = false;
		let emptyRetried = false;
		let shrinks = 0;
		for (;;) {
			const converted = await toOpenAiMessages(context, imageBudget);
			evictedImages = converted.evicted;
			const body: Record<string, unknown> = {
				model: model.id,
				messages: converted.messages,
				stream: true,
				stream_options: { include_usage: true },
			};
			const tools = buildTools(context);
			if (tools?.length) body.tools = tools;
			if (options?.maxTokens ?? model.maxTokens) body.max_tokens = options?.maxTokens ?? model.maxTokens;
			if (options?.temperature !== undefined) body.temperature = options.temperature;
			if (model.thinking) {
				const effort = normalizeReasoningEffort(model.reasoningEffort) ?? "high";
				// DeepSeek-compatible endpoints read the thinking switch from
				// `reasoning_effort` itself (`none` disables it); `thinking` is mirrored
				// for relays that only forward the type field.
				body.thinking = { type: effort === "none" ? "disabled" : "enabled" };
				body.reasoning_effort = effort;
			}
			const rawBody = JSON.stringify(body);
			const bodyBytes = Buffer.byteLength(rawBody, "utf-8");
			if (bodyBytes > imageBudget + TEXT_HEADROOM_BYTES) {
				pushError(describeOversizeBody(bodyBytes, evictedImages));
				return;
			}
			const response = await fetchWithRetry(
				`${baseUrl}/chat/completions`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${apiKey}`,
						...affinityHeaders(baseUrl, options?.sessionId),
					},
					body: rawBody,
					signal: options?.signal,
				},
				3,
			);

			if (!response.ok) {
				if (
					response.status === 413 &&
					shrinks < IMAGE_BUDGET_SHRINKS &&
					Math.floor(imageBudget / 2) >= MIN_IMAGE_BYTES
				) {
					shrinks++;
					imageBudget = Math.floor(imageBudget / 2);
					continue;
				}
				const errorBody = await response.text().catch(() => "");
				const message =
					response.status === 413
						? describeOversizeBody(bodyBytes, evictedImages)
						: `OpenAI API error ${response.status}: ${errorBody.slice(0, 500)}`;
				throw new HttpError(message, response.status, errorBody);
			}

			if (!started) {
				stream.push({ type: "start" });
				started = true;
			}

			let text = "";
			let thinking = "";
			const toolCalls = new Map<number, { id: string; name: string; argsText: string }>();
			let finishReason: string | undefined;
			let inputTokens = 0;
			let outputTokens = 0;
			let cacheHitTokens = 0;
			let cacheMissTokens = 0;

			for await (const data of readSse(response, options?.signal)) {
				if (data === "[DONE]") {
					break;
				}
				let chunk: OpenAiChunk;
				try {
					chunk = JSON.parse(data);
				} catch {
					continue;
				}
				// A 200 stream may carry an upstream failure as its first (and
				// only) payload: a bare `{"error": {...}}` with no `choices`.
				// Without this check the error is silently dropped by the
				// `if (!choice) continue;` branch below and surfaces later as a
				// misleading "empty completion" error.
				if (chunk && typeof chunk === "object" && chunk.error) {
					const raw = chunk.error;
					const msg =
						typeof raw === "string"
							? raw
							: raw.message ?? JSON.stringify(raw);
					throw new Error(`Provider error: ${String(msg).slice(0, 500)}`);
				}
				// Usage can arrive in a dedicated final chunk (empty `choices`) or
				// alongside the last choice, so it is read before branching on
				// choices. Cache counters use either the DeepSeek/Kimi fields
				// (`prompt_cache_hit/miss_tokens`) or the OpenAI
				// (`prompt_tokens_details.cached_tokens`) convention.
				if (chunk.usage) {
					const u = chunk.usage;
					if (u.prompt_tokens !== undefined) {
						const hit = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
						const miss = u.prompt_cache_miss_tokens ?? (u.prompt_tokens > hit ? u.prompt_tokens - hit : 0);
						inputTokens = u.prompt_tokens;
						cacheHitTokens = hit;
						cacheMissTokens = miss;
					}
					if (u.completion_tokens !== undefined) {
						outputTokens = u.completion_tokens;
					}
				}
				const choice = chunk.choices?.[0];
				if (!choice) {
					continue;
				}
				if (choice.finish_reason) {
					finishReason = choice.finish_reason;
				}
				const delta = choice.delta ?? {};
				if (delta.content) {
					text += delta.content;
					stream.push({ type: "text_delta", delta: delta.content });
				}
				if (delta.reasoning_content) {
					thinking += delta.reasoning_content;
					stream.push({ type: "thinking_delta", delta: delta.reasoning_content });
				}
				for (const tc of delta.tool_calls ?? []) {
					const index = tc.index ?? 0;
					const existing = toolCalls.get(index);
					if (!existing) {
						toolCalls.set(index, {
							id: tc.id ?? `call_${index}`,
							name: tc.function?.name ?? "",
							argsText: tc.function?.arguments ?? "",
						});
						if (tc.id && tc.function?.name) {
							stream.push({ type: "toolcall_start", id: tc.id, name: tc.function.name });
						}
					} else {
						existing.id = tc.id ?? existing.id;
						existing.name = tc.function?.name ?? existing.name;
						existing.argsText += tc.function?.arguments ?? "";
						stream.push({ type: "toolcall_delta", id: existing.id, partial: existing.argsText });
					}
				}
				if (options?.signal?.aborted) {
					break;
				}
			}

			const content: Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: Record<string, unknown> }> = [];
			if (thinking) content.push({ type: "thinking", thinking });
			if (text) content.push({ type: "text", text });
			// Tool calls are appended after text; keeping them in emitted order isn't
			// semantically required, but a stable, readable order is.
			const indexedToolCalls = [...toolCalls.entries()].sort(([a], [b]) => a - b);
			for (const [, tc] of indexedToolCalls) {
				if (!tc.name) continue;
				const args = parseJsonArguments(tc.argsText);
				content.push({
					type: "toolCall",
					id: tc.id,
					name: tc.name,
					arguments: args ?? { __tjuCodeMalformed: tc.argsText.slice(0, 200) },
				});
			}

			const toolUse = toolCalls.size > 0 && [...toolCalls.values()].some((tc) => tc.name);
			const stopReason =
				finishReason === "tool_calls" || toolUse ? "tool" : finishReason === "length" ? "max" : "stop";

			const usage: Usage = {
				input: inputTokens || estimateTokens(JSON.stringify(context.messages)),
				output: outputTokens || estimateTokens(text + thinking),
				totalTokens: (inputTokens || estimateTokens(JSON.stringify(context.messages))) + (outputTokens || estimateTokens(text + thinking)),
				cacheRead: inputTokens ? cacheHitTokens : undefined,
				cacheWrite: inputTokens && cacheMissTokens ? cacheMissTokens : undefined,
			};

			const message = {
				role: "assistant" as const,
				content: content as AssistantMessage["content"],
				api: "openai-completions" as const,
				provider: model.provider,
				model: model.id,
				usage,
				stopReason,
				timestamp: Date.now(),
			} as AssistantMessage;

			const aborted = options?.signal?.aborted ?? false;
			// A 200 stream with zero deltas and a near-zero prompt_tokens is an
			// upstream failure swallowed into a "successful" empty completion (seen
			// with relays when the request exceeds their limits). Retry once; if it
			// still comes back empty, surface an error instead of a silent empty
			// message so the caller does not mistake it for model behavior.
			const emptyAnomaly =
				!aborted && !thinking && !text && toolCalls.size === 0 && inputTokens < EMPTY_COMPLETION_PROMPT_TOKENS;
			if (emptyAnomaly && !emptyRetried) {
				emptyRetried = true;
				continue;
			}

			if (aborted) {
				stream.push({ type: "error", message: { ...message, stopReason: "aborted", errorMessage: "aborted", timestamp: Date.now() } });
			} else if (emptyAnomaly) {
				stream.push({
					type: "error",
					message: {
						...message,
						stopReason: "error",
						errorMessage:
							`Provider returned an empty completion twice (prompt_tokens=${inputTokens}, no content). ` +
							"The request may exceed the provider's limits; reduce context size or try another model.",
						timestamp: Date.now(),
					},
				});
			} else {
				stream.push({ type: "done", message });
			}
			break;
		}
		stream.end();
	} catch (error) {
		if (options?.signal?.aborted) {
			stream.push({
				type: "error",
				message: {
					role: "assistant",
					content: [],
					api: "openai-completions",
					provider: model.provider,
					model: model.id,
					usage: { input: 0, output: 0, totalTokens: 0 },
					stopReason: "aborted",
					errorMessage: "aborted",
					timestamp: Date.now(),
				},
			});
		} else {
			stream.push({
				type: "error",
				message: {
					role: "assistant",
					content: [],
					api: "openai-completions",
					provider: model.provider,
					model: model.id,
					usage: { input: 0, output: 0, totalTokens: 0 },
					stopReason: "error",
					errorMessage: error instanceof Error ? error.message : String(error),
					timestamp: Date.now(),
				},
			});
		}
		stream.end();
	}
}

export const openaiCompletions: ProviderAdapter = {
	api: "openai-completions",
	async stream(model, context, options) {
		const stream = new EventStream<GroundEvent>();
		void runStream(stream, model, context, options);
		return stream;
	},
}