import { z } from "zod";
import type { AgentTool, Todo, TodoStore } from "../types.ts";

// Models often reach for the generic task-tracker vocabulary instead of our
// canonical statuses. Normalize those aliases at parse time so a first attempt
// succeeds instead of bouncing with "Invalid enum value".
const statusAliases: Record<string, "pending" | "active" | "completed"> = {
	in_progress: "active",
	"in progress": "active",
	doing: "active",
	working: "active",
	done: "completed",
	complete: "completed",
	finished: "completed",
	todo: "pending",
	"to do": "pending",
	waiting: "pending",
};

const priorityAliases: Record<string, "low" | "medium" | "high"> = {
	normal: "medium",
	urgent: "high",
	critical: "high",
	important: "high",
};

const normalizeStatus = (value: unknown): unknown =>
	typeof value === "string" ? (statusAliases[value.toLowerCase()] ?? value) : value;

const normalizePriority = (value: unknown): unknown =>
	typeof value === "string" ? (priorityAliases[value.toLowerCase()] ?? value) : value;

export const todoSchema = z.object({
	todos: z
		.array(
			z.object({
				content: z.string().describe("Task description"),
				status: z
					.preprocess(normalizeStatus, z.enum(["pending", "active", "completed"]))
					.optional()
					.describe("Task status (one of pending|active|completed; defaults to pending; use active for in-progress work)"),
				priority: z
					.preprocess(normalizePriority, z.enum(["low", "medium", "high"]))
					.optional()
					.describe("Optional priority (one of low|medium|high)"),
			}),
		)
		.describe("The full updated todo list; replace the previous list entirely"),
});

export type TodoInput = z.infer<typeof todoSchema>;

function todoMark(status: Todo["status"]): string {
	return status === "completed" ? "[x]" : status === "active" ? "[~]" : "[ ]";
}

export function formatTodos(todos: Todo[]): string {
	if (!todos.length) return "(no tasks)";
	return todos
		.map((t) => `- ${todoMark(t.status)} ${t.content}${t.priority ? ` (${t.priority})` : ""}`)
		.join("\n");
}

/**
 * Session-scoped todo/plan tool. The current list lives in the shared
 * `store` and is also injected into the request context by the Agent, so the
 * model always sees the plan it is working on.
 */
export function createTodoTool(store: TodoStore): AgentTool<typeof todoSchema> {
	return {
		name: "todowrite",
		label: "todowrite",
		description:
			"Create and maintain a structured task list for the current coding session. Use it to track progress during multi-step work and keep todo statuses current. Pass the full updated list each time. Each item has content, a status (pending|active|completed) and an optional priority (low|medium|high).",
		parameters: todoSchema,
		promptSnippet: "track multi-step work with a todo list",
		async execute(_call, { todos }) {
			store.todos = todos.map((t) => ({
				content: t.content,
				status: t.status ?? "pending",
				priority: t.priority,
			}));
			const text = store.todos.length
				? `Todo list updated:\n${formatTodos(store.todos)}`
				: "Todo list cleared.";
			return { content: text, details: { todos: store.todos } };
		},
	};
}
