import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createAgent } from "../create-agent.ts";
import { createApprovalGate } from "../core/permission.ts";
import { SessionStore } from "../core/session-store.ts";
import type { RunConfig } from "../config.ts";
import type { Agent, AgentState } from "../core/agent.ts";
import type { AgentEvent, Model, TodoStore } from "../core/types.ts";

function write(text: string): void {
	process.stdout.write(text);
}

/** Small lines-to-stream renderer for the terminal chat experience. */
function subscribeRenderer(agent: Agent): () => void {
	let textLength = 0;
	let toolTextLength = 0;
	let currentToolCallId: string | undefined;
	let thinkingPrinted = false;
	return agent.subscribe(async (event: AgentEvent) => {
		switch (event.type) {
			case "message_start":
				textLength = 0;
				thinkingPrinted = false;
				break;
			case "message_update": {
				if (event.message.role !== "assistant") break;
				if (!thinkingPrinted && textLength === 0 && hasThinking(event.message)) {
					write("\u001b[90m[思考中...]\u001b[0m\n");
					thinkingPrinted = true;
				}
				if (event.message.stopReason === "tool") break;
				const full = extractText(event.message);
				if (full.length > textLength) {
					write(full.slice(textLength));
					textLength = full.length;
				}
				break;
			}
			case "message_end": {
				if (event.message.role === "assistant") {
					write("\n");
					textLength = 0;
				}
				break;
			}
			case "tool_start": {
				currentToolCallId = event.toolCallId;
				toolTextLength = 0;
				if (event.toolName === "fetch") {
					const url = (event.args as { url?: string } | undefined)?.url ?? "";
					write(`\n\u001b[36m[fetch]\u001b[0m ${url}\n【正在联网查询中】\n`);
				} else {
					write(`\n\u001b[36m[${event.toolName}]\u001b[0m ${JSON.stringify(event.args)}\n`);
				}
				break;
			}
			case "tool_update": {
				if (event.toolName === "fetch") break;
				if (event.toolCallId === currentToolCallId) {
					const partial = event.partialContent ?? "";
					if (partial.length > toolTextLength) {
						write(partial.slice(toolTextLength));
						toolTextLength = partial.length;
					} else if (partial.length < toolTextLength) {
						write(partial);
						toolTextLength = partial.length;
					}
				}
				break;
			}
			case "tool_end": {
				currentToolCallId = undefined;
				toolTextLength = 0;
				if (event.toolName === "fetch") {
					const details = event.result.details as
						| { status?: number; bytes?: number; truncated?: boolean }
						| undefined;
					const status = details?.status !== undefined ? `HTTP ${details.status}` : "";
					const bytes = details?.bytes !== undefined ? `${details.bytes} bytes` : "";
					const truncated = details?.truncated ? " (truncated)" : "";
					write(`\u001b[90m[fetched ${status} ${bytes}${truncated}]\u001b[0m\n`);
				} else {
					write(`\n\u001b[90m${truncateText(event.result.content, 200)}\u001b[0m\n`);
				}
				break;
			}
			default:
				break;
		}
	});
}

function extractText(message: { content: Array<{ type: string; text?: string; thinking?: string }> }): string {
	return message.content
		.filter((c) => c.type === "text" && c.text)
		.map((c) => c.text ?? "")
		.join("");
}

function hasThinking(message: { content: Array<{ type: string; thinking?: string }> }): boolean {
	return message.content.some((c) => c.type === "thinking" && c.thinking);
}

function truncateText(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatStatus(state: AgentState): string {
	const totalTokens = state.messages.reduce(
		(acc, m) => acc + (m.role === "assistant" ? m.usage.totalTokens : 0),
		0,
	);
	const cacheRead = state.messages.reduce(
		(acc, m) => acc + (m.role === "assistant" ? m.usage.cacheRead ?? 0 : 0),
		0,
	);
	const inputTokens = state.messages.reduce(
		(acc, m) => acc + (m.role === "assistant" ? m.usage.input : 0),
		0,
	);
	const cacheLine =
		cacheRead > 0
			? ` | cache: ${cacheRead} (${inputTokens > 0 ? Math.round((cacheRead / inputTokens) * 100) : 0}%)`
			: "";
	const lines = [
		`model:     ${state.model.provider}/${state.model.id}`,
		`api:       ${state.model.api}${state.model.baseUrl ? ` | ${state.model.baseUrl}` : ""}`,
		`thinking:  ${state.model.thinking === false ? "off" : "on"}`,
		`messages:  ${state.messages.length}, tokens: ${totalTokens}${cacheLine}`,
		`streaming: ${state.isStreaming ? "yes" : "no"}`,
	];
	return `${lines.join("\n")}\n`;
}

function formatHelp(model: Model): string {
	return [
		`Commands:`,
		`  /exit            Quit the session (aborts first if a turn is running)`,
		`  /clear           Reset the transcript`,
		`  /abort           Cancel the current turn (Streaming)`,
		`  /model <id>      Switch the model, eg. /model deepseek-v4-pro (current: ${model.id})`,
		`  /status          Show model, thinking and token usage`,
		`  /work            Manage work items: list | open <id> | new | rm <id>`,
		`  /help            Show this help`,
		``,
		`Text while a turn runs is queued and injected to the agent as input.`,
		`Ctrl+C cancels the current turn once; Esc-like a second time exits.`,
	].join("\n") + "\n";
}

/**
 * Run an interactive terminal chat session.
 */
export async function runChat(config: RunConfig, cwd: string): Promise<void> {
	const rl = createInterface({ input, output });
	const approval = createApprovalGate({
		workdir: cwd,
		ask: async (request) => {
			for (;;) {
				const answer = (
					await rl.question(
						`\n\u001b[33m[权限]\u001b[0m 工具 ${request.toolName} 将访问工作目录外的目录：\n  ${request.scopeDir}\n允许? (y/n) > `,
					)
				)
					.trim()
					.toLowerCase();
				if (answer === "y" || answer === "yes") return true;
				if (answer === "n" || answer === "no") return false;
			}
		},
	});
	const sessionDir = config.sessionDir ?? join(homedir(), ".tju-code", "works");
	const sessionStore = new SessionStore({ dir: sessionDir });
	const workTodos: TodoStore = { todos: [] };
	const agent = createAgent({ config, cwd, todoStore: workTodos, beforeToolCall: approval });
	const unsubscribe = subscribeRenderer(agent);

	let interrupted = false;
	const onSigInt = () => {
		if (!agent.streaming || interrupted) process.exit(0);
		interrupted = true;
		agent.abort();
		write("\n\u001b[90m[aborting turn]\u001b[0m\n");
	};
	rl.on("SIGINT", onSigInt);

	let currentWorkId: string | null = null;
	const saveCurrentWork = async (): Promise<void> => {
		if (!currentWorkId) return;
		const state = agent.state;
		const existing = await sessionStore.load(currentWorkId);
		await sessionStore.save({
			id: currentWorkId,
			title: existing?.title ?? `work-${currentWorkId}`,
			cwd,
			model: state.model,
			messages: state.messages,
			todos: workTodos.todos,
			createdAt: existing?.createdAt ?? Date.now(),
			updatedAt: Date.now(),
		});
	};
	const openWork = async (id: string): Promise<void> => {
		const item = await sessionStore.load(id);
		if (!item) {
			write(`work item not found: ${id}\n`);
			return;
		}
		await agent.waitForIdle();
		await saveCurrentWork();
		workTodos.todos = item.todos.slice();
		agent.restore({ messages: item.messages, todos: item.todos });
		currentWorkId = id;
		await sessionStore.setLastActive(id);
		write(`opened work item: ${item.title} (${item.messages.length} messages, ${item.todos.length} todos)\n`);
	};
	const formatWorks = async (): Promise<void> => {
		const items = await sessionStore.list();
		if (!items.length) {
			write("no work items\n");
			return;
		}
		for (const item of items) {
			const active = item.id === currentWorkId ? " *" : "";
			write(
				`${item.id}  ${item.title}  (${item.messages.length} msgs, ${item.todos.length} todos)${active}\n`,
			);
		}
	};
	agent.subscribe(async (event) => {
		if (event.type === "agent_end") {
			try {
				if (!currentWorkId && agent.state.messages.length) {
					currentWorkId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
				}
				await saveCurrentWork();
			} catch {
				// work item persistence is best-effort in the CLI
			}
		}
	});

	const restoreStartupWork = async (): Promise<void> => {
		const items = await sessionStore.list();
		let item = null;
		const lastActive = await sessionStore.getLastActive();
		if (lastActive && items.some((i) => i.id === lastActive)) {
			item = await sessionStore.load(lastActive);
		}
		if (!item) item = items[0] ?? null;
		if (item) {
			workTodos.todos = item.todos.slice();
			agent.restore({ messages: item.messages, todos: item.todos });
			currentWorkId = item.id;
			write(`resumed work item: ${item.title} (${item.messages.length} messages, ${item.todos.length} todos)\n`);
		} else {
			currentWorkId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
			await saveCurrentWork();
			write(`created new work item: ${currentWorkId}\n`);
		}
		await sessionStore.setLastActive(currentWorkId);
	};
	await restoreStartupWork();

	try {
		while (true) {
			const line = (await rl.question("\u001b[32m> \u001b[0m")).trim();
			if (!line) continue;

			if (line.startsWith("/")) {
				const [run, ...rest] = line.split(" ");
				switch (run) {
					case "/exit":
						if (agent.streaming) agent.abort();
						await agent.waitForIdle();
						return;
					case "/abort":
						interrupted = false;
						if (agent.streaming) agent.abort();
						break;
					case "/status":
						write(formatStatus(agent.state));
						break;
					case "/model": {
						const st = agent.state;
						const id = rest[0];
						if (!id) {
							write(`current model: ${st.model.provider}/${st.model.id}\n`);
							break;
						}
						agent.setModel({ ...st.model, id });
						write(`switched model to ${id} (takes effect next turn)\n`);
						break;
					}
					case "/help":
						write(formatHelp(agent.state.model));
						break;
					case "/clear":
						await agent.waitForIdle();
						agent.resetTranscript();
						write("transcript cleared\n");
						break;
					case "/work": {
						const sub = rest[0] ?? "list";
						if (sub === "list") {
							await formatWorks();
						} else if (sub === "new") {
							if (agent.streaming) {
								write("agent is busy; wait for the turn to finish\n");
								break;
							}
							await saveCurrentWork();
							currentWorkId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
							await agent.waitForIdle();
							agent.resetTranscript();
							workTodos.todos = [];
							await sessionStore.setLastActive(currentWorkId);
							write(`created new work item: ${currentWorkId}\n`);
						} else if (sub === "open" && rest[1]) {
							await openWork(rest[1]);
						} else if (sub === "rm" && rest[1]) {
							if (currentWorkId === rest[1]) {
								write("cannot remove the active work item\n");
								break;
							}
							await sessionStore.remove(rest[1]);
							write(`removed work item: ${rest[1]}\n`);
						} else {
							write("usage: /work list | open <id> | new | rm <id>\n");
						}
						break;
					}
					default:
						write(`Unknown command: ${run}. Try /help\n`);
				}
				continue;
			}

			if (agent.streaming) {
				agent.steer(line);
				continue;
			}

			try {
				await agent.prompt(line);
			} catch (error) {
				write(`\u001b[31m${error instanceof Error ? error.message : String(error)}\u001b[0m\n`);
			}
		}
	} finally {
		unsubscribe();
		rl.off("SIGINT", onSigInt);
		rl.close();
	}
}