import type { AssistantMessage, Attachment, Message } from "../core/types.ts";
import type { ReasoningEffort } from "../core/reasoning-effort.ts";
import type { EventStream } from "../core/event-stream.ts";

/** Streaming contract produced by provider adapters. */
export type GroundEvent =
	| { type: "start" }
	| { type: "thinking_delta"; delta: string }
	| { type: "text_delta"; delta: string }
	| { type: "toolcall_start"; id: string; name: string }
	| { type: "toolcall_delta"; id: string; partial: string }
	| { type: "toolcall_end"; id: string; name: string; args: Record<string, unknown> }
	// Terminal events: exactly one of these ends the stream.
	| { type: "done"; message: AssistantMessage }
	| { type: "error"; message: AssistantMessage };

export interface Context {
	systemPrompt?: string;
	messages: Message[];
	tools?: ReadonlyArray<{ name: string; description: string; parameters: unknown }>;
	/**
	 * Optional resolver that turns an attachment reference into its byte
	 * content (raw bytes). Provided by hosts that back attachments (e.g. the
	 * GUI's per-work-item upload store). When absent, adapters skip attachment
	 * blocks — plain-text conversations are unaffected.
	 */
	resolveAttachment?: (attachment: Attachment) => Promise<Uint8Array | null>;
}

export interface ProviderStreamOptions {
	apiKey?: string;
	baseUrl?: string;
	maxTokens?: number;
	temperature?: number;
	signal?: AbortSignal;
	/** Steering used by providers that support prompt caching/session affinity. */
	sessionId?: string;
}

export interface ProviderAdapter {
	api: string;
	stream: (
		model: {
			id: string;
			provider: string;
			baseUrl?: string;
			maxTokens?: number;
			thinking?: boolean;
			reasoningEffort?: ReasoningEffort;
		},
		context: Context,
		options?: ProviderStreamOptions,
	) => Promise<EventStream<GroundEvent>>;
}