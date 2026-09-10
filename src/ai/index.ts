import { anthropicMessages } from "./anthropic.ts";
import { openaiCompletions } from "./openai.ts";
import type { Context, GroundEvent, ProviderAdapter, ProviderStreamOptions } from "./types.ts";
import type { AssistantMessage, Model } from "../core/types.ts";
import type { EventStream } from "../core/event-stream.ts";

const adapters = new Map<string, ProviderAdapter>();

export function registerAdapter(adapter: ProviderAdapter): void {
	adapters.set(adapter.api, adapter);
}

export function getAdapter(api: string): ProviderAdapter {
	const adapter = adapters.get(api);
	if (!adapter) {
		throw new Error(`No provider adapter registered for api: ${api}`);
	}
	return adapter;
}

export function listAdapters(): string[] {
	return [...adapters.keys()];
}

registerAdapter(openaiCompletions);
registerAdapter(anthropicMessages);

/** Streaming entry point. Returns the ground event stream for a model request. */
export async function stream(
	model: Model,
	context: Context,
	options?: ProviderStreamOptions,
): Promise<EventStream<GroundEvent>> {
	const adapter = getAdapter(model.api);
	return adapter.stream(model, context, options);
}

/** Non-streaming convenience: resolve to the final assistant message. */
export async function complete(
	model: Model,
	context: Context,
	options?: ProviderStreamOptions,
): Promise<AssistantMessage> {
	const events = await stream(model, context, options);
	let last: AssistantMessage = {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: { input: 0, output: 0, totalTokens: 0 },
		stopReason: "error",
		errorMessage: "Stream ended without a message",
		timestamp: Date.now(),
	};
	for await (const event of events) {
		if (event.type === "done" || event.type === "error") {
			last = event.message;
		}
	}
	return last;
}

export * from "./types.ts";
export { estimateTokens, HttpError, salvageJson } from "./utils.ts";