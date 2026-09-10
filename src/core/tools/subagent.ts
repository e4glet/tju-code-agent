import { z } from "zod";
import { runAgentLoop } from "../agent-loop.ts";
import type {
	AgentContext,
	AgentLoopConfig,
	AgentTool,
	AssistantMessage,
	Model,
} from "../types.ts";

export const subAgentSchema = z.object({
	task: z
		.string()
		.min(1)
		.describe(
			"The task to delegate to a sub-agent, described precisely as a self-contained instruction",
		),
});

export type SubAgentInput = z.infer<typeof subAgentSchema>;

export interface SubAgentToolOptions {
	cwd: string;
	model: Model;
	apiKey?: string;
	maxTokens?: number;
	temperature?: number;
	/** Maximum assistant turns for the sub-agent. Defaults to 5. */
	maxTurns?: number;
	/** The sub-agent's toolset. The `task` and `todowrite` tools are intentionally excluded. */
	tools?: AgentTool[];
	beforeToolCall?: AgentLoopConfig["beforeToolCall"];
	afterToolCall?: AgentLoopConfig["afterToolCall"];
}

const SUBAGENT_MAX_TURNS = 5;
const MAX_RESULT_CHARS = 8000;

function subAgentSystemPrompt(cwd: string): string {
	return [
		`You are a sub-agent working inside the project directory ${cwd}.`,
		"Complete the delegated task precisely using the available tools (read, search, edit, run commands as needed).",
		"Work autonomously and verify your work. Do not create todo lists and do not ask for clarification unless truly blocked.",
		"When done, return a concise summary of what you did and the outcome. It is returned to the orchestrating agent, so include exact file paths, commands run, and results.",
	].join("\n");
}

function assistantText(message: AssistantMessage): string {
	return message.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text" && !!c.text)
		.map((c) => c.text)
		.join("");
}

/**
 * Delegate a self-contained subtask to a bounded sub-agent. The sub-agent runs
 * its own focused loop (a fresh transcript and a small turn budget) and returns
 * a concise summary as the tool result, so the main conversation stays lean and
 * the delegated work is isolated from the main transcript.
 */
export function createSubAgentTool(options: SubAgentToolOptions): AgentTool<typeof subAgentSchema> {
	return {
		name: "task",
		label: "task",
		description:
			"Delegate a self-contained subtask to a sub-agent that runs its own focused loop (bounded turns) and returns a concise summary. Use for isolated, well-scoped work so the main conversation stays lean. The sub-agent cannot delegate further or touch the main todo list.",
		parameters: subAgentSchema,
		promptSnippet: "delegate an isolated subtask to a sub-agent",
		async execute(call, { task }) {
			const subSystemPrompt = subAgentSystemPrompt(options.cwd);
			const subConfig: AgentLoopConfig = {
				model: options.model,
				apiKey: options.apiKey,
				maxTokens: options.maxTokens,
				temperature: options.temperature,
				systemPrompt: subSystemPrompt,
				tools: options.tools,
				maxTurns: options.maxTurns ?? SUBAGENT_MAX_TURNS,
				beforeToolCall: options.beforeToolCall,
				afterToolCall: options.afterToolCall,
			};
			const subContext: AgentContext = {
				systemPrompt: subSystemPrompt,
				messages: [],
				tools: options.tools,
			};
			const added = await runAgentLoop([task], subContext, subConfig, call.signal, () => {});
			const finalAssistant = [...added].reverse().find((m): m is AssistantMessage => m.role === "assistant");
			if (!finalAssistant) {
				throw new Error("Sub-agent returned no assistant message");
			}
			if (finalAssistant.stopReason === "error" || finalAssistant.stopReason === "aborted") {
				throw new Error(finalAssistant.errorMessage || `Sub-agent ${finalAssistant.stopReason}`);
			}
			const text = assistantText(finalAssistant);
			if (!text.trim()) {
				throw new Error("Sub-agent returned an empty result");
			}
			const result = text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n[truncated]` : text;
			return { content: result, details: { turns: added.length } };
		},
	};
}
