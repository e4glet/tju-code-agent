import { runAgentLoop } from "./agent-loop.ts";
import { compactTranscript } from "./context.ts";
import { createSelfCorrection } from "./self-correct.ts";
import type {
	AgentContext,
	AgentEvent,
	AgentLoopConfig,
	AgentTool,
	AgentToolResult,
	AfterToolCallContext,
	Attachment,
	BeforeToolCallContext,
	BeforeToolCallResult,
	Message,
	Model,
	Todo,
	TodoStore,
	UserMessage,
} from "./types.ts";

export interface AgentOptions {
	model: Model;
	systemPrompt?: string;
	/** Optional explicit tools to provide. Defaults to the bundled coding tools. */
	tools?: AgentTool[];
	apiKey?: string;
	maxTokens?: number;
	temperature?: number;
	/** Token budget for the transcript. When exceeded, messages are compressed. */
	maxContextTokens?: number;
	/** Maximum assistant turns per run before the loop forces a final summary turn. */
	maxTurns?: number;
	/** Shared todo list holder; its contents are injected into the request context each turn. */
	todoStore?: TodoStore;
	/** Resolver that turns a user-message attachment reference into its bytes. */
	resolveAttachment?: (attachment: Attachment) => Promise<Uint8Array | null>;
	beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
	afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AgentToolResult | undefined>;
	/** Turn-level self-correction hook. Defaults to {@link createSelfCorrection}. */
	afterTurn?: AgentLoopConfig["afterTurn"];
}

/** Snapshot of the agent transcript and runtime state. */
export interface AgentState {
	systemPrompt: string;
	model: Model;
	tools: AgentTool[];
	messages: Message[];
	isStreaming: boolean;
	streamingMessage?: Message;
	errorMessage?: string;
}

export type AgentListener = (event: AgentEvent, signal?: AbortSignal) => Promise<void> | void;

/**
 * Stateful coding agent wrapping the low-level loop.
 *
 * Owns the transcript, emits lifecycle events through {@link subscribe},
 * supports abort/cancel, and queues "steer" messages that are injected mid-run.
 */
export class Agent {
	private systemPrompt: string;
	private model: Model;
	private tools: AgentTool[];
	private messages: Message[] = [];
	private isStreaming = false;
	private streamingMessage?: Message;
	private errorMessage?: string;
	private apiKey?: string;
	private maxTokens?: number;
	private temperature?: number;
	private maxContextTokens?: number;
	private maxTurns?: number;
	private beforeToolCall?: AgentOptions["beforeToolCall"];
	private afterToolCall?: AgentOptions["afterToolCall"];
	private afterTurn?: AgentLoopConfig["afterTurn"];
	private todoStore?: TodoStore;
	private resolveAttachment?: (attachment: Attachment) => Promise<Uint8Array | null>;

	private readonly listeners = new Set<AgentListener>();
	private readonly steeringQueue: Message[] = [];
	private activeRun?: Promise<void>;
	private activeController?: AbortController;

	constructor(options: AgentOptions) {
		this.systemPrompt = options.systemPrompt ?? "";
		this.model = options.model;
		this.tools = options.tools?.slice() ?? [];
		this.apiKey = options.apiKey;
		this.maxTokens = options.maxTokens;
		this.temperature = options.temperature;
		this.maxContextTokens = options.maxContextTokens;
		this.maxTurns = options.maxTurns;
		this.todoStore = options.todoStore;
		this.beforeToolCall = options.beforeToolCall;
		this.afterToolCall = options.afterToolCall;
		this.afterTurn = options.afterTurn;
		this.resolveAttachment = options.resolveAttachment;
	}

	/** Current agent state snapshot. */
	get state(): AgentState {
		return {
			systemPrompt: this.systemPrompt,
			model: this.model,
			tools: this.tools.slice(),
			messages: this.messages.slice(),
			isStreaming: this.isStreaming,
			streamingMessage: this.streamingMessage,
			errorMessage: this.errorMessage,
		};
	}

	/** Set the model for subsequent turns. */
	setModel(model: Model): void {
		this.model = model;
	}

	/** Replace the tool set for subsequent turns. */
	setTools(tools: AgentTool[]): void {
		this.tools = tools.slice();
	}

	/** Subscribe to lifecycle events. Returns an unsubscribe function. */
	subscribe(listener: AgentListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/** True while a prompt is being processed. */
	get streaming(): boolean {
		return this.isStreaming;
	}

	/** Abort the current run, if any. */
	abort(): void {
		this.activeController?.abort();
	}

	/** Wait for the current run (and all its listeners) to settle. */
	async waitForIdle(): Promise<void> {
		if (this.activeRun) await this.activeRun;
	}

	/** Queue a message to be injected mid-run, after the current turn's tool calls. */
	steer(input: string | Message): void {
		const message: Message =
			typeof input === "string" ? { role: "user", content: input, timestamp: Date.now() } : input;
		this.steeringQueue.push(message);
	}

	/** Reset the transcript and queues. Only valid while idle. */
	resetTranscript(): void {
		if (this.isStreaming) {
			throw new Error("Cannot reset while streaming. Wait for the run to finish first.");
		}
		this.messages = [];
		this.steeringQueue.length = 0;
		this.errorMessage = undefined;
		this.streamingMessage = undefined;
	}

	/**
	 * Replace the transcript and todo list with a saved snapshot so a
	 * previous conversation can be resumed without triggering a run. Only
	 * valid while idle.
	 */
	restore(state: { messages: Message[]; todos?: Todo[] }): void {
		if (this.isStreaming) {
			throw new Error("Cannot restore while streaming. Wait for the run to finish first.");
		}
		this.messages = state.messages.slice();
		if (state.todos && this.todoStore) {
			this.todoStore.todos = state.todos.slice();
		}
		this.steeringQueue.length = 0;
		this.errorMessage = undefined;
		this.streamingMessage = undefined;
	}

	/** Current todo list, if a shared TodoStore was provided. */
	get todos(): Todo[] {
		return this.todoStore?.todos ?? [];
	}

	get hasQueuedMessages(): boolean {
		return this.steeringQueue.length > 0;
	}

	/** Start a new prompt. Throws if a run is already active. */
	async prompt(input: string | Message | Message[]): Promise<void> {
		if (this.isStreaming) {
			throw new Error("Agent is already processing. Use steer() to queue a message, or wait for the run to finish.");
		}
		const prompts: Message[] = Array.isArray(input)
			? input
			: typeof input === "string"
				? ([{ role: "user", content: input, timestamp: Date.now() }] satisfies UserMessage[])
				: [input];

		await this.runWithLifecycle((config, signal) =>
			runAgentLoop(
				prompts,
				this.createContextSnapshot(),
				config,
				signal,
				(event) => this.dispatch(event, signal),
			).then(() => {}),
		);
	}

	private createContextSnapshot(): AgentContext {
		return {
			systemPrompt: this.systemPrompt,
			messages: this.messages.slice(),
			tools: this.tools.slice(),
			resolveAttachment: this.resolveAttachment,
		};
	}

	private createLoopConfig(): AgentLoopConfig {
		return {
			model: this.model,
			apiKey: this.apiKey,
			maxTokens: this.maxTokens,
			temperature: this.temperature,
			systemPrompt: this.systemPrompt,
			tools: this.tools,
			beforeToolCall: this.beforeToolCall,
			afterToolCall: this.afterToolCall,
			maxTurns: this.maxTurns,
			afterTurn: this.afterTurn ?? createSelfCorrection(),
			transformContext: async (messages, signal, options) => {
				const result = await compactTranscript(messages, {
					model: this.model,
					apiKey: this.apiKey,
					systemPrompt: this.systemPrompt,
					tools: this.tools,
					maxContextTokens: this.maxContextTokens,
					force: options?.force,
					signal,
				});
				if (result) this.messages = messages.slice();
				return result ?? messages;
			},
			getSteeringMessages: async () => this.steeringQueue.splice(0),
		};
	}

	private async runWithLifecycle(
		executor: (config: AgentLoopConfig, signal: AbortSignal) => Promise<void>,
	): Promise<void> {
		const controller = new AbortController();
		this.activeController = controller;
		this.isStreaming = true;
		this.streamingMessage = undefined;
		this.errorMessage = undefined;

		const run = executor(this.createLoopConfig(), controller.signal).finally(() => {
			this.isStreaming = false;
			this.streamingMessage = undefined;
			this.activeController = undefined;
		});

		this.activeRun = run;
		try {
			await run;
		} finally {
			this.activeRun = undefined;
		}
	}

	/** Update internal state for an event, then forward it to listeners. */
	private async dispatch(event: AgentEvent, signal?: AbortSignal): Promise<void> {
		switch (event.type) {
			case "message_start":
			case "message_update":
				this.streamingMessage = event.message;
				break;
			case "message_end":
				this.streamingMessage = undefined;
				this.messages.push(event.message);
				break;
			case "turn_end":
				if (event.message.errorMessage) {
					this.errorMessage = event.message.errorMessage;
				}
				break;
			default:
				break;
		}

		for (const listener of this.listeners) {
			await listener(event, signal);
		}
	}
}