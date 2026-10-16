import { z } from "zod";
import { runAgentLoop } from "../agent-loop.ts";
import { composeSystemPrompt, readProjectDocs } from "../../config.ts";
import type {
	AgentContext,
	AgentLoopConfig,
	AgentProviderState,
	AgentTool,
	AssistantMessage,
} from "../types.ts";

export const SUBAGENT_KINDS = ["general", "explore"] as const;
export type SubAgentKind = (typeof SUBAGENT_KINDS)[number];

/** Tools an `explore` sub-agent may use: read-only, so it cannot mutate the repo. */
const EXPLORE_ALLOWED_TOOLS = new Set(["read", "grep", "glob"]);

export const subAgentSchema = z.object({
	agent: z
		.enum(SUBAGENT_KINDS)
		.optional()
		.describe(
			'Sub-agent kind: "explore" is read-only (read/grep/glob only) and is the default choice for searching and reading; "general" has the full toolset and may edit and run commands. Defaults to "general".',
		),
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
	/**
	 * Live provider state of the orchestrating agent, read at call time so the
	 * sub-agent runs on whatever interface the parent is currently using.
	 */
	provider: AgentProviderState;
	maxTokens?: number;
	temperature?: number;
	/** Maximum assistant turns per sub-agent run. Defaults to {@link SUBAGENT_MAX_TURNS}. */
	maxTurns?: number;
	/** The full toolset; `explore` sub-agents receive a read-only subset. */
	tools?: AgentTool[];
	/** Experiment arm C: when false the `agent` parameter is ignored (always general). */
	exploreEnabled?: boolean;
	beforeToolCall?: AgentLoopConfig["beforeToolCall"];
	afterToolCall?: AgentLoopConfig["afterToolCall"];
}

const SUBAGENT_MAX_TURNS = 20;
const EXPLORE_MAX_TURNS = 12;
const MAX_RESULT_CHARS = 8000;
/** Concurrent sub-agents per orchestrator. Parallel `task` calls beyond this queue. */
const MAX_CONCURRENT_SUBAGENTS = 4;

/** Return shape every sub-agent must use, so the parent can act without re-reading. */
const RESULT_CONTRACT = [
	"Return your answer using exactly these headings:",
	"## Files — absolute paths you read or changed",
	"## Commands — commands you ran and their key output",
	"## Evidence — the file:line or output that supports each claim",
	"## Open questions — anything unresolved, or (none)",
	"If you could not complete the task, say so plainly under Open questions instead of guessing.",
].join("\n");

export function subAgentSystemPrompt(cwd: string, modelId: string | undefined, kind: SubAgentKind): string {
	const shared = [
		`You are a ${kind === "explore" ? "read-only search" : "general"} sub-agent working inside the project directory ${cwd}.`,
		"Complete the delegated task precisely. Work autonomously; do not create todo lists and do not ask for clarification unless truly blocked.",
		RESULT_CONTRACT,
	];
	const body =
		kind === "explore"
			? [
					"Your role is EXCLUSIVELY to search and analyze: you may read files, search contents and list files, and nothing else.",
					"You MUST NOT create, modify, delete, move or copy files, and you MUST NOT run shell commands.",
					"Report exact absolute paths and the evidence for each conclusion; do not speculate.",
				]
			: [
					"You may read, search, edit files and run commands as needed, and you must verify your own changes.",
				];
	const promptLines = [...shared.slice(0, 2), ...body, shared[2]].join("\n");
	const docs = readProjectDocs(cwd);
	return composeSystemPrompt({ base: promptLines, cwd, docs, modelId });
}

/** Small FIFO limiter so a burst of `task` calls cannot fan out unbounded. */
function createLimiter(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
	let active = 0;
	const waiters: Array<() => void> = [];
	return async <T>(fn: () => Promise<T>): Promise<T> => {
		if (active >= max) await new Promise<void>((resolve) => waiters.push(resolve));
		active++;
		try {
			return await fn();
		} finally {
			active--;
			waiters.shift()?.();
		}
	};
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
	const limit = createLimiter(MAX_CONCURRENT_SUBAGENTS);
	return {
		name: "task",
		label: "task",
		description: options.exploreEnabled === false
			? "Delegate a self-contained subtask to a sub-agent that runs its own focused loop (bounded turns) and returns a structured summary, so the main conversation stays lean. The sub-agent cannot delegate further or touch the main todo list."
			: 'Delegate a self-contained subtask to a sub-agent that runs its own focused loop and returns a structured summary, so the main conversation stays lean.\n' +
				'Use agent="explore" (read-only: read/grep/glob) whenever answering needs reading several files, searching a directory, or gathering evidence — it returns conclusions plus exact paths, not file bodies.\n' +
				'Use agent="general" only for work that must edit files or run commands.\n' +
				"Treat a sub-agent summary as unverified: re-check any conclusion you will act on with one cheap tool call before editing. The sub-agent cannot delegate further or touch the main todo list.",
		parameters: subAgentSchema,
		async execute(call, { agent, task }) {
			const kind: SubAgentKind = options.exploreEnabled === false ? "general" : (agent ?? "general");
			const toolset = kind === "explore" ? (options.tools ?? []).filter((t) => EXPLORE_ALLOWED_TOOLS.has(t.name)) : options.tools;
			const subSystemPrompt = subAgentSystemPrompt(options.cwd, options.provider.model.id, kind);
			const subConfig: AgentLoopConfig = {
				model: options.provider.model,
				apiKey: options.provider.apiKey,
				sessionId: options.provider.sessionId,
				maxTokens: options.maxTokens,
				temperature: options.temperature,
				systemPrompt: subSystemPrompt,
				tools: toolset,
				maxTurns: options.maxTurns ?? (kind === "explore" ? EXPLORE_MAX_TURNS : SUBAGENT_MAX_TURNS),
				beforeToolCall: options.beforeToolCall,
				afterToolCall: options.afterToolCall,
			};
			const subContext: AgentContext = {
				systemPrompt: subSystemPrompt,
				messages: [],
				tools: toolset,
			};
			const added = await limit(() => runAgentLoop([task], subContext, subConfig, call.signal, () => {}));
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
			const usage = { input: 0, output: 0, totalTokens: 0, cacheRead: 0, cacheWrite: 0 };
			for (const m of added) {
				if (m.role !== "assistant") continue;
				usage.input += m.usage.input;
				usage.output += m.usage.output;
				usage.totalTokens += m.usage.totalTokens;
				usage.cacheRead += m.usage.cacheRead ?? 0;
				usage.cacheWrite += m.usage.cacheWrite ?? 0;
			}
			return { content: result, details: { agent: kind, turns: added.length, usage } };
		},
	};
}
