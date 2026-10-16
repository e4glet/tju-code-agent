import { Agent } from "./core/agent.ts";
import type { AgentOptions } from "./core/agent.ts";
import type { AfterToolCallContext, AgentTool, AgentToolResult, Attachment, TodoStore } from "./core/types.ts";
import { createAllTools } from "./core/tools/index.ts";
import { createAskUserTool, type AskUserRequest } from "./core/tools/ask.ts";
import { createTodoTool } from "./core/tools/todo.ts";
import { createSubAgentTool } from "./core/tools/subagent.ts";
import { DEFAULT_SYSTEM_PROMPT, BASE_SYSTEM_PROMPT, modelFromConfig, readProjectDocs, type RunConfig } from "./config.ts";
import { EXPERIMENT, type ExperimentFlags } from "./experiment.ts";

export interface CreateAgentOptions extends Pick<AgentOptions, "beforeToolCall" | "afterToolCall"> {
	config: RunConfig;
	cwd: string;
	/** Experiment flags (see `src/experiment.ts`). Defaults to the process-wide mode. */
	experiment?: ExperimentFlags;
	systemPrompt?: string;
	tools?: ReturnType<typeof createAllTools>;
	/** Shared todo list holder. When omitted a fresh one is created for the agent. */
	todoStore?: TodoStore;
	/** Resolver that turns a user-message attachment reference into its bytes. */
	resolveAttachment?: (attachment: Attachment) => Promise<Uint8Array | null>;
	/**
	 * Handler for ask_user questions. Absent in contexts without a user
	 * (tests, headless runs): the tool then tells the model to proceed with
	 * its best judgment instead of hanging.
	 */
	askUser?: (request: AskUserRequest, signal?: AbortSignal) => Promise<string>;
}

const SECURITY_HINT_TOOLS = new Set(["write", "edit"]);

function securityHintAfterToolCall(
	userHook?: CreateAgentOptions["afterToolCall"],
): AgentOptions["afterToolCall"] {
	return async (context: AfterToolCallContext, signal?: AbortSignal) => {
		const base =
			(await userHook?.(context, signal)) ??
			(context.result satisfies AgentToolResult);
		if (context.isError || !SECURITY_HINT_TOOLS.has(context.tool.name)) return base;
		return {
			...base,
			content: `${base.content}\n\n[security] Files were modified. Run the scan tool (or /scan) to check for leaked secrets and dependency vulnerabilities before committing.`,
		};
	};
}

/** Build a ready-to-use {@link Agent} bound to a working directory. */
export function createAgent(options: CreateAgentOptions): Agent {
	const { config, cwd } = options;
	const experiment = options.experiment ?? EXPERIMENT;
	const todoStore: TodoStore = options.todoStore ?? { todos: [] };
	const agentModel = modelFromConfig(config);
	const docs = readProjectDocs(cwd);
	const agent = new Agent({
		model: agentModel,
		experiment,
		promptSections: {
			base: options.systemPrompt ?? (experiment.delegate ? DEFAULT_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT),
			cwd,
			docs,
		},
		tools: [],
		apiKey: config.apiKey,
		provider: { model: agentModel, apiKey: config.apiKey, entryId: config.providerEntryId },
		maxTokens: config.maxTokens,
		maxContextTokens: config.maxContextTokens,
		maxImageBytes: config.maxImageBytes,
		maxTurns: config.maxTurns,
		beforeToolCall: options.beforeToolCall,
		afterToolCall: securityHintAfterToolCall(options.afterToolCall),
		todoStore,
		resolveAttachment: options.resolveAttachment,
	});
	agent.setTools(
		buildAgentTools(agent, {
			cwd,
			maxTokens: config.maxTokens,
			allowPrivateFetch: config.allowPrivateFetch,
			tools: options.tools,
			todoStore,
			beforeToolCall: options.beforeToolCall,
			afterToolCall: options.afterToolCall,
			askUser: options.askUser,
			experiment,
		}),
	);
	return agent;
}

export interface AgentToolchainDeps {
	cwd: string;
	maxTokens?: number;
	tools?: AgentTool[];
	/** Operator opt-in for fetch to private addresses (see RunConfig). */
	allowPrivateFetch?: boolean;
	todoStore: TodoStore;
	beforeToolCall?: AgentOptions["beforeToolCall"];
	afterToolCall?: AgentOptions["afterToolCall"];
	askUser?: (request: AskUserRequest, signal?: AbortSignal) => Promise<string>;
	experiment?: ExperimentFlags;
}

export function buildAgentTools(agent: Agent, deps: AgentToolchainDeps): AgentTool[] {
	const toolset = deps.tools ?? createAllTools(deps.cwd, { allowPrivateFetch: deps.allowPrivateFetch });
	const afterToolCall = securityHintAfterToolCall(deps.afterToolCall);
	return [
		...toolset,
		createTodoTool(deps.todoStore) as unknown as AgentTool,
		createSubAgentTool({
			cwd: deps.cwd,
			provider: agent.provider,
			maxTokens: deps.maxTokens,
			tools: toolset,
			exploreEnabled: (deps.experiment ?? EXPERIMENT).delegate,
			beforeToolCall: deps.beforeToolCall,
			afterToolCall,
		}) as unknown as AgentTool,
		createAskUserTool({
			canAsk: () => agent.consumeAskSlot(),
			releaseAskSlot: () => agent.releaseAskSlot(),
			ask: deps.askUser ?? (async () => {
				throw new Error("no user to ask");
			}),
		}) as unknown as AgentTool,
	];
}