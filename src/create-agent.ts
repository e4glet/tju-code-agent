import { Agent } from "./core/agent.ts";
import type { AgentOptions } from "./core/agent.ts";
import type { AfterToolCallContext, AgentTool, AgentToolResult, Attachment, TodoStore } from "./core/types.ts";
import { createAllTools } from "./core/tools/index.ts";
import { createTodoTool } from "./core/tools/todo.ts";
import { createSubAgentTool } from "./core/tools/subagent.ts";
import { DEFAULT_SYSTEM_PROMPT, modelFromConfig, type RunConfig } from "./config.ts";

export interface CreateAgentOptions extends Pick<AgentOptions, "beforeToolCall" | "afterToolCall"> {
	config: RunConfig;
	cwd: string;
	systemPrompt?: string;
	tools?: ReturnType<typeof createAllTools>;
	/** Shared todo list holder. When omitted a fresh one is created for the agent. */
	todoStore?: TodoStore;
	/** Resolver that turns a user-message attachment reference into its bytes. */
	resolveAttachment?: (attachment: Attachment) => Promise<Uint8Array | null>;
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
	const todoStore: TodoStore = options.todoStore ?? { todos: [] };
	const tools = options.tools ?? createAllTools(cwd);
	const model = modelFromConfig(config);
	const afterToolCall = securityHintAfterToolCall(options.afterToolCall);
	return new Agent({
		model,
		systemPrompt: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
		tools: [
			...tools,
			createTodoTool(todoStore) as unknown as AgentTool,
			createSubAgentTool({
				cwd,
				model,
				apiKey: config.apiKey,
				maxTokens: config.maxTokens,
				tools,
				beforeToolCall: options.beforeToolCall,
				afterToolCall,
			}) as unknown as AgentTool,
		],
		apiKey: config.apiKey,
		maxTokens: config.maxTokens,
		maxContextTokens: config.maxContextTokens,
		maxTurns: config.maxTurns,
		beforeToolCall: options.beforeToolCall,
		afterToolCall,
		todoStore,
		resolveAttachment: options.resolveAttachment,
	});
}