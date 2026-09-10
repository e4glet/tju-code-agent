import type { z } from "zod";
import type { ReasoningEffort } from "./reasoning-effort.ts";

/**
 * Provider API kinds supported by the unified AI layer.
 * - "openai-completions": OpenAI-compatible chat/completions API (covers DeepSeek, Kimi, Zhipu, Qwen, ...)
 * - "anthropic-messages": Anthropic Messages API
 */
export type ApiKind = "openai-completions" | "anthropic-messages";

/** A resolved model configuration. */
export interface Model {
	id: string;
	api: ApiKind;
	provider: string;
	baseUrl?: string;
	maxTokens?: number;
	/** Ask the provider to enable extended thinking/reasoning. */
	thinking?: boolean;
	/** Reasoning effort level when thinking is enabled. Defaults to "high". */
	reasoningEffort?: ReasoningEffort;
}

export interface TextContent {
	type: "text";
	text: string;
}

export interface ThinkingContent {
	type: "thinking";
	thinking: string;
}

export interface ToolCallContent {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export type AssistantContent = TextContent | ThinkingContent | ToolCallContent;

export interface Usage {
	input: number;
	output: number;
	totalTokens: number;
	/** Prompt tokens served from the provider's cache (cache hit). */
	cacheRead?: number;
	/** Prompt tokens written to cache for future calls. */
	cacheWrite?: number;
}

export type StopReason = "stop" | "max" | "tool" | "error" | "aborted";

/** Kinds of attachments supported on a user message. */
export type AttachmentKind = "image";

/** A file attached to a user message (image/doc/etc). Only lightweight
 * metadata is stored in the message; the bytes live in the attachment store
 * (per work item) and are resolved by the provider adapter at request time. */
export interface Attachment {
	/** Local id unique within the work item (used as the on-disk file name). */
	id: string;
	name: string;
	mime: string;
	size: number;
	kind: AttachmentKind;
	/** Optional image width/height hint captured at upload time (for preview). */
	width?: number;
	height?: number;
}

export interface UserMessage {
	role: "user";
	content: string;
	/** Optional files (images) attached to this message for multimodal models. */
	attachments?: Attachment[];
	timestamp: number;
}

export interface AssistantMessage {
	role: "assistant";
	content: AssistantContent[];
	api: ApiKind;
	provider: string;
	model: string;
	usage: Usage;
	stopReason: StopReason;
	errorMessage?: string;
	timestamp: number;
}

export interface ToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: string;
	isError: boolean;
	details?: unknown;
	/** Names of tools made available by this result. Reserved for future use. */
	addedToolNames?: string[];
	timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

/** A single item in the session-scoped todo/plan list maintained by todowrite. */
export interface Todo {
	content: string;
	status: "pending" | "active" | "completed";
	priority?: "low" | "medium" | "high";
}

/** Mutable holder for the session's todo list, shared between the todowrite tool and the Agent. */
export interface TodoStore {
	todos: Todo[];
}

/** Partial progress reported by a running tool. */
export interface ToolPartialUpdate {
	content: string;
	details?: unknown;
}

/** Result returned by a tool execution. */
export interface AgentToolResult<T = unknown> {
	content: string;
	details?: T;
}

export interface ToolCallArgs {
	toolCallId: string;
	signal?: AbortSignal;
	onUpdate?: (partial: ToolPartialUpdate) => void;
}

/**
 * Tool definition used by the agent runtime.
 * Parameters use a Zod schema so arguments are validated before execution.
 */
export interface AgentTool<TParams extends z.ZodType = z.ZodTypeAny> {
	name: string;
	label: string;
	description: string;
	parameters: TParams;
	/** Short snippet contributed to the system prompt so the model knows how to use the tool. */
	promptSnippet?: string;
	execute: (args: ToolCallArgs, params: z.output<TParams>) => Promise<AgentToolResult>;
}

export interface AgentToolResult<T = unknown> {
	content: string;
	details?: T;
}

/** Extension-point for app-specific agent messages (declaration merging). */
export interface CustomAgentMessages {
	// Empty by default - apps extend via declaration merging.
}

export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];

/** Transcript and tools snapshot passed into the low-level agent loop. */
export interface AgentContext {
	systemPrompt: string;
	messages: AgentMessage[];
	tools?: AgentTool[];
	/** Optional resolver that turns an attachment reference into its bytes. */
	resolveAttachment?: (attachment: Attachment) => Promise<Uint8Array | null>;
}

export interface BeforeToolCallContext {
	toolCall: ToolCallContent;
	args: unknown;
}

export interface BeforeToolCallResult {
	block?: boolean;
	reason?: string;
}

export interface AfterToolCallContext {
	tool: AgentTool;
	args: unknown;
	result: AgentToolResult;
	isError: boolean;
}

/** Turn-level context handed to the `afterTurn` self-correction hook. */
export interface AfterTurnContext {
	/** The assistant message produced this turn (may contain tool calls). */
	message: AssistantMessage;
	toolCalls: ToolCallContent[];
	toolResults: ToolResultMessage[];
	turnCount: number;
}

export interface AgentLoopConfig {
	model: Model;
	systemPrompt?: string;
	tools?: AgentTool[];
	apiKey?: string;
	maxTokens?: number;
	temperature?: number;
	/**
	 * Optional context transform before the provider call. Use this for
	 * workspace pruning, summarization, atomic injection of project context, etc.
	 * Receives the live transcript array (may mutate it in place) and the run's
	 * abort signal. `options.force` is set when the provider reported a context
	 * overflow and the transform should compact regardless of the budget.
	 * Return `null` to send the transcript unchanged.
	 */
	transformContext?: (
		messages: AgentMessage[],
		signal?: AbortSignal,
		options?: { force?: boolean },
	) => Promise<AgentMessage[] | null>;
	/** Called before a tool executes (after validation). Return { block: true } to prevent execution. */
	beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
	/** Called after a tool finishes to transform its result before it is returned to the model. */
	afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AgentToolResult | undefined>;
	/**
	 * Optional self-correction hook run after each turn (and its tool results).
	 * Return a corrective user message to inject into the transcript (e.g. when
	 * the agent repeats the same action or produces an empty turn), or `null` to
	 * continue normally. Runs once per turn and only injects when non-null, so
	 * a focused agent is never disturbed.
	 */
	afterTurn?: (context: AfterTurnContext) => Promise<string | null>;
	/** Maximum assistant turns per run. When exceeded, the loop injects a final summary turn and stops. Defaults to 50. */
	maxTurns?: number;
	/** Returns steering messages to inject mid-run (for example while a tool is executing). */
	getSteeringMessages?: () => Promise<AgentMessage[]>;
	/** Returns follow-up messages to process after the agent would otherwise stop. */
	getFollowUpMessages?: () => Promise<AgentMessage[]>;
}

/**
 * Events emitted by the agent loop. UI hosts (CLI, GUI, other tools) can render
 * live progress by subscribing to these.
 */
export type AgentEvent =
	| { type: "agent_start" }
	| { type: "agent_end"; messages: Message[] }
	| { type: "turn_start" }
	| { type: "turn_end"; message: AssistantMessage; toolResults: ToolResultMessage[] }
	| { type: "message_start"; message: Message }
	| { type: "message_update"; message: AssistantMessage; delta: string }
	| { type: "message_end"; message: Message }
	| { type: "tool_start"; toolCallId: string; toolName: string; args: unknown }
	| { type: "tool_update"; toolCallId: string; toolName: string; partialContent: string }
	| { type: "tool_end"; toolCallId: string; toolName: string; result: AgentToolResult; isError: boolean };