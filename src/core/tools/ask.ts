import { z } from "zod";
import type { AgentTool } from "../types.ts";

export const askUserSchema = z.object({
	question: z.string().min(1).describe("The single clarifying question to ask the user"),
	options: z
		.array(z.string().min(1))
		.min(1)
		.max(3)
		.describe("Up to 3 suggested answers; the user may also type a custom answer instead"),
});

export type AskUserInput = z.infer<typeof askUserSchema>;

export interface AskUserRequest {
	question: string;
	options: string[];
}

export interface AskUserOptions {
	canAsk: () => boolean;
	releaseAskSlot?: () => void;
	ask: (request: AskUserRequest, signal?: AbortSignal) => Promise<string>;
}

const ASK_LIMIT_MESSAGE =
	"Question limit reached (1 per run). Proceed with your best judgment instead of asking.";

export function createAskUserTool(options: AskUserOptions): AgentTool<typeof askUserSchema> {
	return {
		name: "ask_user",
		label: "ask_user",
		description:
			"Ask the user a clarifying question when progress is genuinely blocked by a decision you cannot reasonably make yourself. Pass up to 3 suggested answers that are mutually exclusive and directly actionable; the user picks one or types their own. At most once per run — otherwise verify with tools and proceed with your best judgment.",
		parameters: askUserSchema,
		promptSnippet: "ask the user for a blocking decision",
		async execute(call, { question, options: suggestions }) {
			if (!options.canAsk()) {
				return { content: ASK_LIMIT_MESSAGE, details: { limited: true } };
			}
			try {
				const answer = await options.ask({ question, options: suggestions }, call.signal);
				return { content: `User answer: ${answer}`, details: { answer } };
			} catch {
				options.releaseAskSlot?.();
				return { content: "The question was cancelled. Proceed with your best judgment." };
			}
		},
	};
}
