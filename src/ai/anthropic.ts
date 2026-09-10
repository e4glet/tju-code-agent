import type { AssistantMessage, Message, Usage } from "../core/types.ts";
import { isDeepSeekProvider, normalizeReasoningEffort, type ReasoningEffort } from "../core/reasoning-effort.ts";
import { EventStream } from "../core/event-stream.ts";
import { readSse } from "./sse.ts";
import { estimateTokens, fetchWithRetry, HttpError, parseJsonArguments, sanitizeMessages } from "./utils.ts";
import type { Context, GroundEvent, ProviderAdapter, ProviderStreamOptions } from "./types.ts";

type AnthropicStreamEvent =
	| {
			type: "message_start";
			message?: {
				usage?: {
					input_tokens?: number;
					output_tokens?: number;
					cache_read_input_tokens?: number;
					cache_creation_input_tokens?: number;
				};
			};
	  }
	| { type: "content_block_start"; index: number; content_block: { type?: string; id?: string; name?: string } }
	| {
			type: "content_block_delta";
			index: number;
			delta?: { type?: string; text?: string; thinking?: string; partial_json?: string } | null;
	  }
	| { type: "content_block_stop"; index: number }
	| { type: "message_delta"; delta?: { stop_reason?: string | null } }
	| { type: "message_stop"; index?: number }
	| { type: "ping" }
	| { type: "error"; error?: { message?: string } };

async function toAnthropicMessages(context: Context): Promise<unknown[]> {
	const { resolveAttachment } = context;
	const messages = sanitizeMessages(context.messages);
	const out: unknown[] = [];
	let i = 0;
	while (i < messages.length) {
		const m = messages[i];
		if (!m) {
			i++;
			continue;
		}
		switch (m.role) {
			case "user": {
				const text = m.content;
				const images = (m.attachments ?? []).filter((a) => a.kind === "image");
				const resolvedImages: Array<{ mime: string; data: string }> = [];
				if (images.length && resolveAttachment) {
					for (const image of images) {
						const bytes = await resolveAttachment(image).catch(() => null);
						if (!bytes) continue;
						resolvedImages.push({
							mime: image.mime || "image/png",
							data: Buffer.from(bytes).toString("base64"),
						});
					}
				}
				const previous = out[out.length - 1] as { role?: string; content?: unknown } | undefined;
				// Merge consecutive plain-text user turns only when neither side
				// carries attachments (image turns must stay their own content array).
				const hasImages = resolvedImages.length > 0;
				if (!hasImages && previous && previous.role === "user" && typeof previous.content === "string") {
					(previous as { content: string }).content += "\n\n" + text;
				} else if (!hasImages) {
					out.push({ role: "user", content: text });
				} else {
					const blocks: unknown[] = [];
					if (text) blocks.push({ type: "text", text });
					for (const img of resolvedImages) {
						blocks.push({
							type: "image",
							source: { type: "base64", media_type: img.mime, data: img.data },
						});
					}
					out.push({ role: "user", content: blocks });
				}
				i++;
				break;
			}
			case "assistant": {
				const text = m.content
					.filter((c) => c.type === "text")
					.map((c) => c.text)
					.join("\n");
				const blocks: unknown[] = [];
				if (text) blocks.push({ type: "text", text });
				for (const c of m.content) {
					if (c.type === "toolCall") {
						blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.arguments });
					}
				}
				// Thinking-only turns (an aborted run) carry no replayable block: the
				// API rejects an empty content array, so the turn is skipped.
				if (blocks.length === 0) {
					i++;
					continue;
				}
				out.push({ role: "assistant", content: blocks });
				i++;
				break;
			}
			case "toolResult": {
				const results: unknown[] = [];
				while (i < messages.length) {
					const next = messages[i];
					if (!next || next.role !== "toolResult") break;
					results.push({
						type: "tool_result",
						tool_use_id: next.toolCallId,
						content: next.content,
						is_error: next.isError,
					});
					i++;
				}
				out.push({ role: "user", content: results });
				break;
			}
			default:
				i++;
				break;
		}
	}
	// Mark the last text block of the final message as a cache breakpoint so
	// repeated prefixes hit the provider cache (cache_read_input_tokens).
	const last = out[out.length - 1] as { role?: string; content?: Array<{ type?: string }> } | undefined;
	const lastBlock = last && Array.isArray(last.content) ? last.content[last.content.length - 1] : undefined;
	if (lastBlock && lastBlock.type === "text") {
		(lastBlock as { cache_control?: { type: "ephemeral" } }).cache_control = { type: "ephemeral" };
	}
	return out;
}

/** Thinking-token budgets per effort level; `max` is clamped by max_tokens anyway. */
const THINKING_BUDGETS = { low: 2048, high: 16384, max: 32768 } as const;

async function runStream(
	stream: EventStream<GroundEvent>,
	model: { id: string; provider: string; baseUrl?: string; maxTokens?: number; thinking?: boolean; reasoningEffort?: ReasoningEffort },
	context: Context,
	options: ProviderStreamOptions | undefined,
): Promise<void> {
	const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		stream.push({
			type: "error",
			message: {
				role: "assistant",
				content: [],
				api: "anthropic-messages",
				provider: model.provider,
				model: model.id,
				usage: { input: 0, output: 0, totalTokens: 0 },
				stopReason: "error",
				errorMessage: "ANTHROPIC_API_KEY is not set",
				timestamp: Date.now(),
			},
		});
		stream.end();
		return;
	}

	const baseUrl = (options?.baseUrl ?? model.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
	const maxTokens = options?.maxTokens ?? model.maxTokens ?? 4096;
	const body: Record<string, unknown> = {
		model: model.id,
		max_tokens: maxTokens,
		messages: await toAnthropicMessages(context),
		stream: true,
	};
	if (context.systemPrompt) {
		body.system = [{ type: "text", text: context.systemPrompt, cache_control: { type: "ephemeral" } }];
	}
	if (context.tools?.length) {
		body.tools = context.tools.map((t) => ({
			name: t.name,
			description: t.description,
			input_schema: t.parameters ?? { type: "object", properties: {} },
		}));
	}
	if (model.thinking) {
		// Anthropic requires temperature to be omitted (or 1) while thinking is
		// enabled, so we skip setting temperature in that case.
		const effort = normalizeReasoningEffort(model.reasoningEffort) ?? "high";
		if (effort === "none") {
			body.thinking = { type: "disabled" };
		} else {
			// The API rejects budget_tokens >= max_tokens, so clamp it while
			// keeping the documented minimum of 1024.
			const budget = Math.min(THINKING_BUDGETS[effort], Math.max(1024, maxTokens - 1));
			body.thinking = {
				type: "enabled",
				budget_tokens: budget,
			};
			// DeepSeek's Anthropic-compatible endpoint ignores budget_tokens and
			// only honours output_config.effort; the native API keeps the budget.
			if (isDeepSeekProvider(model.id, baseUrl)) body.output_config = { effort };
		}
	} else if (options?.temperature !== undefined) {
		body.temperature = options.temperature;
	}

	try {
		const response = await fetchWithRetry(
			`${baseUrl}/v1/messages`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify(body),
				signal: options?.signal,
			},
			3,
		);

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "");
			throw new HttpError(
				`Anthropic API error ${response.status}: ${errorBody.slice(0, 500)}`,
				response.status,
				errorBody,
			);
		}

		stream.push({ type: "start" });

		let text = "";
		let thinking = "";
		const toolCalls = new Map<number, { id: string; name: string; argsText: string }>();
		let stopReason: string | undefined;
		let inputTokens = 0;
		let outputTokens = 0;
		let cacheReadTokens = 0;
		let cacheWriteTokens = 0;

		for await (const data of readSse(response, options?.signal)) {
			let event: AnthropicStreamEvent;
			try {
				event = JSON.parse(data);
			} catch {
				continue;
			}
			switch (event.type) {
				case "message_start":
					inputTokens = event.message?.usage?.input_tokens ?? 0;
					cacheReadTokens = event.message?.usage?.cache_read_input_tokens ?? 0;
					cacheWriteTokens = event.message?.usage?.cache_creation_input_tokens ?? 0;
					break;
				case "content_block_start": {
					const block = event.content_block ?? {};
					if (block.type === "tool_use") {
						const index = (event as { index?: number }).index ?? toolCalls.size;
						if (block.id && block.name) {
							stream.push({ type: "toolcall_start", id: block.id, name: block.name });
						}
						toolCalls.set(index, { id: block.id ?? `call_${index}`, name: block.name ?? "", argsText: "" });
					}
					break;
				}
				case "content_block_delta": {
					const delta = event.delta ?? {};
					if (delta.type === "text_delta" && delta.text) {
						text += delta.text;
						stream.push({ type: "text_delta", delta: delta.text });
					} else if (delta.type === "thinking_delta" && delta.thinking) {
						thinking += delta.thinking;
						stream.push({ type: "thinking_delta", delta: delta.thinking });
					} else if (delta.type === "input_json_delta" && delta.partial_json !== undefined) {
						const index = event.index ?? 0;
						const tc = toolCalls.get(index);
						if (tc) {
							tc.argsText += delta.partial_json;
							stream.push({ type: "toolcall_delta", id: tc.id, partial: tc.argsText });
						}
					}
					break;
				}
				case "message_delta":
					stopReason = event.delta?.stop_reason ?? stopReason;
					break;
				case "error":
					throw new Error(event.error?.message ?? "Anthropic stream error");
				default:
					break;
			}
			if (options?.signal?.aborted) break;
		}

		const content: Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: Record<string, unknown> }> = [];
		if (thinking) content.push({ type: "thinking", thinking });
		if (text) content.push({ type: "text", text });
		for (const tc of toolCalls.values()) {
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
		const finalStopReason =
			stopReason === "tool_use" || toolUse ? "tool" : stopReason === "max_tokens" ? "max" : "stop";

		const estimatedInput = inputTokens || estimateTokens(JSON.stringify(context.messages));
		const estimatedOutput = outputTokens || estimateTokens(text + thinking);
		const usage: Usage = {
			input: estimatedInput,
			output: estimatedOutput,
			totalTokens: estimatedInput + estimatedOutput,
			cacheRead: inputTokens ? cacheReadTokens : undefined,
			cacheWrite: inputTokens && cacheWriteTokens ? cacheWriteTokens : undefined,
		};

		const message: AssistantMessage = {
			role: "assistant",
			content: content as AssistantMessage["content"],
			api: "anthropic-messages",
			provider: model.provider,
			model: model.id,
			usage,
			stopReason: finalStopReason,
			timestamp: Date.now(),
		};

		if (options?.signal?.aborted) {
			stream.push({
				type: "error",
				message: { ...message, stopReason: "aborted", errorMessage: "aborted", timestamp: Date.now() },
			});
		} else {
			stream.push({ type: "done", message });
		}
		stream.end();
	} catch (error) {
		if (options?.signal?.aborted) {
			stream.push({
				type: "error",
				message: {
					role: "assistant",
					content: [],
					api: "anthropic-messages",
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
					api: "anthropic-messages",
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

export const anthropicMessages: ProviderAdapter = {
	api: "anthropic-messages",
	async stream(model, context, options) {
		const stream = new EventStream<GroundEvent>();
		void runStream(stream, model, context, options);
		return stream;
	},
}