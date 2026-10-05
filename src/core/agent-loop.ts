import { zodToJsonSchema } from "zod-to-json-schema";
import { stream } from "../ai/index.ts";
import type { Context, GroundEvent } from "../ai/types.ts";
import type {
	AgentContext,
	AgentEvent,
	AgentLoopConfig,
	AgentTool,
	AgentToolResult,
	AssistantMessage,
	BeforeToolCallResult,
	Message,
	ToolCallContent,
	ToolResultMessage,
	UserMessage,
} from "./types.ts";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const CONTEXT_OVERFLOW_RE =
	/context\s*(length|window|size|overflow|exceeded)|maximum\s*context|prompt\s+is\s+too\s+long|reduce\s+the\s+length\s+of\s+the\s+messages/i;

function isContextOverflow(message: AssistantMessage): boolean {
	if (message.stopReason !== "error") return false;
	const error = message.errorMessage ?? "";
	return CONTEXT_OVERFLOW_RE.test(error);
}

export const TURN_CAP_MARKER = "CRITICAL - MAXIMUM STEPS REACHED";

const MAX_STEPS_PROMPT = `${TURN_CAP_MARKER}

The maximum number of steps allowed for this task has been reached. Tools are disabled until next user input. Respond with text only.

STRICT REQUIREMENTS:
1. Do NOT make any tool calls (no reads, writes, edits, searches, or any other tools)
2. MUST provide a text response summarizing work done so far
3. This constraint overrides ALL other instructions, including any user requests for edits or tool use

Response must include:
- Statement that maximum steps for this agent have been reached
- Summary of what has been accomplished so far
- List of any remaining tasks that were not completed
- Recommendations for what should be done next

Any attempt to use tools is a critical violation. Respond with text ONLY.`;

type AgentPrompt = Message | string;

const DEFAULT_MAX_TURNS = 50;

/**
 * True for the step-cap instruction left in the transcript by older versions,
 * which pushed it as a real user message (see the cap branch in runLoop).
 */
function isLegacyTurnCapNotice(content: unknown): boolean {
	return typeof content === "string" && content.trimStart().startsWith(TURN_CAP_MARKER);
}
/** Extra turns granted when the plan still has open items. */
const TURN_RENEWAL_SIZE = 25;
/** Hard ceiling on renewals, so an unfinished plan can never loop forever. */
const MAX_TURN_RENEWALS = 2;

/**
 * Run the agent loop starting with new prompt messages.
 *
 * Emits {@link AgentEvent}s through `emit` and mutates `context.messages`.
 * Returns the messages added during this run (prompts + assistant turns + tool results).
 */
export async function runAgentLoop(
	prompts: AgentPrompt[],
	context: AgentContext,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: (event: AgentEvent) => Promise<void> | void,
): Promise<Message[]> {
	const startMessages = normalizePrompts(prompts);
	context.messages.push(...startMessages);
	const newMessages: Message[] = startMessages.slice();

	if (config.tools && !context.tools) {
		context.tools = config.tools;
	}

	await emit({ type: "agent_start" });
	for (const message of startMessages) {
		await emit({ type: "message_start", message });
		await emit({ type: "message_end", message });
	}

	await runLoop(context, config, signal, newMessages, emit);
	await emit({ type: "agent_end", messages: context.messages.slice() });
	return newMessages;
}

function normalizePrompts(input: AgentPrompt[]): UserMessage[] {
	return input.map((item) => {
		if (typeof item === "string") {
			return { role: "user", content: item, timestamp: Date.now() };
		}
		if (item.role === "user") {
			return {
				role: "user",
				content: item.content,
				attachments: (item as UserMessage).attachments?.length
					? (item as UserMessage).attachments
					: undefined,
				timestamp: item.timestamp,
			};
		}
		return { role: "user", content: "", timestamp: item.timestamp };
	});
}

async function runLoop(
	context: AgentContext,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	newMessages: Message[],
	emit: (event: AgentEvent) => Promise<void> | void,
): Promise<void> {
	let maxTurns = config.maxTurns ?? DEFAULT_MAX_TURNS;
	let renewals = 0;
	let turnCount = 0;
	const hasOpenWork = (): boolean => {
		try {
			return config.hasPendingWork?.() === true;
		} catch {
			return false;
		}
	};
	while (true) {
		turnCount++;
		if (turnCount > maxTurns) {
			// The plan still has open items: extend the budget instead of cutting
			// the run off mid-plan. The model is not told about it, it just keeps
			// working. Bounded by MAX_TURN_RENEWALS so a stuck plan still stops.
			if (renewals < MAX_TURN_RENEWALS && hasOpenWork()) {
				renewals++;
				maxTurns += TURN_RENEWAL_SIZE;
				await emit({
					type: "notice",
					level: "warn",
					message: `任务清单仍有未完成项，已自动延长本轮步数上限 +${TURN_RENEWAL_SIZE} 步（第 ${renewals}/${MAX_TURN_RENEWALS} 次，当前上限 ${maxTurns} 步）。`,
				});
				continue;
			}

			// Budget exhausted: ask for one last text-only turn to hand off the work,
			// then stop unconditionally so a misbehaving model cannot loop forever.
			// The instruction is handed to the provider as an ephemeral final message
			// (see streamAssistantResponse) and deliberately never enters the
			// transcript: a persisted "tools are disabled" user message would show up
			// as a user bubble, contradict every later request, and poison the
			// context until compaction happens to drop it.
			const planOpen = hasOpenWork();
			await emit({
				type: "notice",
				level: "warn",
				message: planOpen
					? `已达本轮步数上限（${maxTurns} 步）且自动续期已用尽，但任务清单仍有未完成项。已要求模型停止调用工具并汇总进度；发送新消息即可继续执行。`
					: `已达本轮步数上限（${maxTurns} 步）。已要求模型停止调用工具并汇总进度；发送新消息即可继续执行。`,
			});

			await emit({ type: "turn_start" });
			const finalMessage = await streamAssistantResponse(context, config, signal, emit, true, MAX_STEPS_PROMPT);
			newMessages.push(finalMessage);
			await emit({ type: "turn_end", message: finalMessage, toolResults: [] });
			return;
		}

		await emit({ type: "turn_start" });

		// Drain steering messages that arrived while the previous turn ran.
		let steering: Message[] = [];
		try {
			steering = (await config.getSteeringMessages?.()) ?? [];
		} catch {
			steering = [];
		}
		if (steering.length > 0) {
			for (const message of steering as Message[]) {
				await emit({ type: "message_start", message });
				await emit({ type: "message_end", message });
				context.messages.push(message);
				newMessages.push(message);
			}
		}

		const message = await streamAssistantResponse(context, config, signal, emit);
		newMessages.push(message);

		if (message.stopReason === "error" || message.stopReason === "aborted") {
			await emit({ type: "turn_end", message, toolResults: [] });
			return;
		}

		const toolCalls = message.content.filter(isToolCall);
		const toolResults: ToolResultMessage[] = [];

		if (toolCalls.length > 0) {
			const results = await executeToolCalls(
				context,
				message,
				toolCalls,
				config,
				signal,
				emit,
				message.stopReason === "max"
					? `The response reached the output token limit, so its arguments may be truncated. Re-issue the tool call ${toolCalls.map((t) => `"${t.name}"`).join(", ")} with complete arguments.`
					: undefined,
			);
			toolResults.push(...results);
			for (const result of results) {
				context.messages.push(result);
				newMessages.push(result);
			}
		}

		await emit({ type: "turn_end", message, toolResults });

		// Self-correction: let the hook inspect the turn and inject a corrective
		// user message (repeated actions / empty turns) to keep the agent focused
		// on the user's task. Only runs when the hook returns a message.
		let correction: string | null = null;
		try {
			correction = (await config.afterTurn?.({ message, toolCalls, toolResults, turnCount })) ?? null;
		} catch {
			correction = null;
		}
		if (correction) {
			const correctionMessage: UserMessage = {
				role: "user",
				content: correction,
				timestamp: Date.now(),
			};
			context.messages.push(correctionMessage);
			newMessages.push(correctionMessage);
			await emit({ type: "message_start", message: correctionMessage });
			await emit({ type: "message_end", message: correctionMessage });
			continue;
		}

		if (toolCalls.length > 0) {
			continue;
		}

		// No tool calls this turn: drain follow-up messages if any, otherwise stop.
		let followUps: Message[] = [];
		try {
			followUps = (await config.getFollowUpMessages?.()) ?? [];
		} catch {
			followUps = [];
		}
		if (followUps.length > 0) {
			for (const message of followUps as Message[]) {
				await emit({ type: "message_start", message });
				await emit({ type: "message_end", message });
				context.messages.push(message);
				newMessages.push(message);
			}
			continue;
		}

		break;
	}
}

function isToolCall(content: AssistantMessage["content"][number]): content is ToolCallContent {
	return content.type === "toolCall";
}

/**
 * Stream one assistant response. The transcript can be transformed by
 * `config.transformContext` before it is sent to the model (compaction,
 * injection, etc.).
 */
async function streamAssistantResponse(
	context: AgentContext,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: (event: AgentEvent) => Promise<void> | void,
	disableTools = false,
	finalInstruction?: string,
): Promise<AssistantMessage> {
	let overflowRetried = false;
	for (;;) {
		let messages: Message[] = context.messages;
		if (config.transformContext) {
			try {
				const transformed = await config.transformContext(
					messages,
					signal,
					overflowRetried ? { force: true } : undefined,
				);
				if (transformed) messages = transformed;
			} catch {
				// fall back to the unchanged transcript when compression fails
				messages = context.messages;
			}
		}

		// Older versions pushed the step-cap instruction into the transcript as a
		// real user message, so it is persisted in existing work items and would
		// otherwise be replayed on every later request as a standing "do not call
		// tools" instruction. Drop it on the way out (the stored transcript is left
		// untouched) and keep the original array identity when there is nothing to
		// strip, so the provider prefix cache stays stable.
		const transcript = messages.some((m) => m.role === "user" && isLegacyTurnCapNotice(m.content))
			? messages.filter((m) => !(m.role === "user" && isLegacyTurnCapNotice(m.content)))
			: messages;

		// An ephemeral instruction is appended *after* context transformation and
		// after the legacy scrub, so it is always the last message, cannot be
		// compacted away, and can never be mistaken for (or removed by) the
		// transcript-level cleanup above.
		const providerMessages = finalInstruction
			? [
					...transcript,
					{ role: "user", content: finalInstruction, timestamp: Date.now() } satisfies UserMessage,
				]
			: transcript;

		const providerContext: Context = {
			systemPrompt: context.systemPrompt || config.systemPrompt,
			messages: providerMessages,
			tools: disableTools
				? undefined
				: context.tools?.map((t) => ({
						name: t.name,
						description: t.description,
						parameters: zodToJsonSchema(t.parameters),
					})),
			resolveAttachment: context.resolveAttachment,
		};

		const eventStream = await stream(config.model, providerContext, {
			apiKey: config.apiKey,
			maxTokens: config.maxTokens,
			temperature: config.temperature,
			signal,
		});

		let partial: AssistantMessage | null = null;
		let text = "";
		let thinking = "";
		let final: AssistantMessage | null = null;

		for await (const event of eventStream) {
			switch (event.type) {
				case "start":
					partial = createPartialAssistant(config);
					context.messages.push(partial);
					await emit({ type: "message_start", message: { ...partial } });
					break;
				case "thinking_delta":
					thinking += event.delta;
					await emitDelta(partial, context, emit, text, thinking, event.delta);
					break;
				case "text_delta":
					text += event.delta;
					await emitDelta(partial, context, emit, text, thinking, event.delta);
					break;
				case "done":
				case "error":
					final = event.message;
					break;
				default:
					break;
			}
		}

		if (!final) {
			final = {
				role: "assistant",
				content: partial?.content ?? [],
				api: config.model.api,
				provider: config.model.provider,
				model: config.model.id,
				usage: { input: 0, output: 0, totalTokens: 0 },
				stopReason: "error",
				errorMessage: "Stream ended without a final message",
				timestamp: Date.now(),
			};
		}

		// Context-overflow recovery: when the provider rejected the request for
		// being too long and nothing was produced yet, force a compaction and
		// retry once instead of surfacing the error.
		if (!overflowRetried && !partial && !text && !thinking && isContextOverflow(final)) {
			overflowRetried = true;
			continue;
		}

		if (partial) {
			context.messages[context.messages.length - 1] = final;
			await emit({ type: "message_update", message: final, delta: "" });
		} else {
			context.messages.push(final);
			await emit({ type: "message_start", message: final });
		}
		await emit({ type: "message_end", message: final });
		return final;
	}
}

function createPartialAssistant(cfg: AgentLoopConfig): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: cfg.model.api,
		provider: cfg.model.provider,
		model: cfg.model.id,
		usage: { input: 0, output: 0, totalTokens: 0 },
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

async function emitDelta(
	partial: AssistantMessage | null,
	context: AgentContext,
	emit: (event: AgentEvent) => Promise<void> | void,
	text: string,
	thinking: string,
	delta: string,
): Promise<void> {
	if (!partial) return;
	const content: AssistantMessage["content"] = [];
	if (thinking) {
		content.push({ type: "thinking", thinking });
	}
	if (text) {
		content.push({ type: "text", text });
	}
	if (content.length === 0 && !delta) return;
	partial.content = content as never;
	context.messages[context.messages.length - 1] = partial;
	await emit({ type: "message_update", message: { ...partial }, delta });
}

async function executeToolCalls(
	context: AgentContext,
	assistantMessage: AssistantMessage,
	toolCalls: ToolCallContent[],
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: (event: AgentEvent) => Promise<void> | void,
	failReason: string | undefined,
): Promise<ToolResultMessage[]> {
	if (failReason) {
		return await Promise.all(
			toolCalls.map(async (toolCall): Promise<ToolResultMessage> => {
				await emit({
					type: "tool_start",
					toolCallId: toolCall.id,
					toolName: toolCall.name,
					args: toolCall.arguments,
				});
				const result: AgentToolResult = { content: failReason };
				await emit({
					type: "tool_end",
					toolCallId: toolCall.id,
					toolName: toolCall.name,
					result,
					isError: true,
				});
				const message = toToolResultMessage(toolCall, result, true);
				await emit({ type: "message_start", message });
				await emit({ type: "message_end", message });
				return message;
			}),
		);
	}
	type PreparedEntry =
		| { toolCall: ToolCallContent; tool: AgentTool; args: unknown; error: undefined }
		| { toolCall: ToolCallContent; tool: AgentTool | undefined; args: undefined; error: string };

	const prepared: PreparedEntry[] = [];
	for (const toolCall of toolCalls) {
		const tool = context.tools?.find((t) => t.name === toolCall.name);
		if (!tool) {
			prepared.push({ toolCall, tool: undefined, args: undefined, error: `Tool not found: ${toolCall.name}` });
			continue;
		}
		const malformed = (toolCall.arguments as Record<string, unknown>).__tjuCodeMalformed;
		if (malformed) {
			prepared.push({
				toolCall,
				tool,
				args: undefined,
				error:
					`Arguments for ${toolCall.name} are not valid JSON and were not executed. ` +
					"Re-issue this tool call with complete, valid JSON arguments.\n" +
					`Raw arguments received: ${String(malformed).slice(0, 200)}`,
			});
			continue;
		}
		const parsed = tool.parameters.safeParse(toolCall.arguments);
		if (!parsed.success) {
			prepared.push({
				toolCall,
				tool,
				args: undefined,
				error: `Invalid arguments for ${toolCall.name}: ${parsed.error.issues
					.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
					.join("; ")}`,
			});
			continue;
		}
		if (config.beforeToolCall) {
			let before: BeforeToolCallResult | undefined;
			try {
				before = await config.beforeToolCall({ toolCall, args: parsed.data }, signal);
			} catch (error) {
				before = { block: true, reason: `beforeToolCall hook failed: ${errorMessage(error)}` };
			}
			if (before?.block) {
				prepared.push({
					toolCall,
					tool,
					args: undefined,
					error: before.reason ?? `Tool execution was blocked: ${toolCall.name}`,
				});
				continue;
			}
		}
		prepared.push({ toolCall, tool, args: parsed.data, error: undefined });
	}

	return await Promise.all(
		prepared.map(async (entry): Promise<{ toolCall: ToolCallContent; message: ToolResultMessage }> => {
			await emit({
				type: "tool_start",
				toolCallId: entry.toolCall.id,
				toolName: entry.toolCall.name,
				args: entry.toolCall.arguments,
			});

			if (entry.error || !entry.tool) {
				const result: AgentToolResult = { content: entry.error ?? "Tool not found" };
				await emit({
					type: "tool_end",
					toolCallId: entry.toolCall.id,
					toolName: entry.toolCall.name,
					result,
					isError: true,
				});
				const message = toToolResultMessage(entry.toolCall, result, true);
				await emit({ type: "message_start", message });
				await emit({ type: "message_end", message });
				return { toolCall: entry.toolCall, message };
			}

			let result: AgentToolResult;
			let isError = false;
			try {
				result = await entry.tool.execute(
					{
						toolCallId: entry.toolCall.id,
						signal,
						onUpdate: (partial) => {
							void emit({
								type: "tool_update",
								toolCallId: entry.toolCall.id,
								toolName: entry.toolCall.name,
								partialContent: partial.content,
							});
						},
					},
					entry.args as Parameters<AgentTool["execute"]>[1],
				);
			} catch (error) {
				result = { content: error instanceof Error ? error.message : String(error) };
				isError = true;
			}

			if (config.afterToolCall && !isError) {
				let overridden: AgentToolResult | undefined;
				try {
					overridden = await config.afterToolCall(
						{ tool: entry.tool, result, isError, args: entry.args },
						signal,
					);
				} catch (error) {
					overridden = { content: `afterToolCall hook failed: ${errorMessage(error)}` };
				}
				if (overridden) result = overridden;
			}

			await emit({
				type: "tool_end",
				toolCallId: entry.toolCall.id,
				toolName: entry.toolCall.name,
				result,
				isError,
			});
			const message = toToolResultMessage(entry.toolCall, result, isError);
			await emit({ type: "message_start", message });
			await emit({ type: "message_end", message });
			return { toolCall: entry.toolCall, message };
		}),
	).then((outcomes) => outcomes.map((o) => o.message));
}

function toToolResultMessage(toolCall: ToolCallContent, result: AgentToolResult, isError: boolean): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId: toolCall.id,
		toolName: toolCall.name,
		content: result.content,
		details: result.details,
		isError,
		timestamp: Date.now(),
	};
}