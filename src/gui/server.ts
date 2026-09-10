import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgent } from "../create-agent.ts";
import { cleanupRuns, EventLog, isSafeRunId, listRuns, readRunEvents, readRunEventsStream, removeRun, removeRuns, summarizeRuns } from "../core/event-log.ts";
import { createApprovalGate } from "../core/permission.ts";
import { SessionStore, type WorkItem } from "../core/session-store.ts";
import { normalizeReasoningEffort, type ReasoningEffort } from "../core/reasoning-effort.ts";
import type { CliFlags, RunConfig } from "../config.ts";
import type { TodoStore, UserMessage } from "../core/types.ts";
import { APP_JS, STYLE_CSS, VIEW_HTML } from "./ui.ts";
import { AttachmentStore } from "./attachment-store.ts";

interface SseClient {
	res: ServerResponse;
	close: () => void;
}

export interface GuiServerOptions {
	config: RunConfig;
	port?: number;
	open?: boolean;
	cwd?: string;
}

/** Start the browser GUI server. Resolves once the server is listening. */
export async function startGuiServer(config: RunConfig, flags: CliFlags): Promise<void> {
	const port = typeof flags.port === "string" ? Number(flags.port) || 9399 : 9399;
	const open = flags["no-open"] !== true;
	const cwd = process.env.TJU_CODE_CWD ?? process.cwd();

	const clients = new Set<SseClient>();
	const pendingApprovals = new Map<string, (mode: boolean | "always") => void>();
	const token = randomBytes(16).toString("hex");

	const logDir = config.logDir ?? join(homedir(), ".tju-code", "logs");
	const logRetentionDays = config.logRetentionDays ?? 7;
	await cleanupRuns(logDir, logRetentionDays);

	const sessionDir = config.sessionDir ?? join(homedir(), ".tju-code", "works");
	const sessionStore = new SessionStore({ dir: sessionDir });
	const attachmentStore = new AttachmentStore(join(homedir(), ".tju-code", "attachments"));
	const workTodos: TodoStore = { todos: [] };
	let currentWorkId: string | null = null;
	let currentRunId: string | null = null;
	let activeLog: EventLog | null = null;

	const makeRunId = (): string => `${Date.now()}-${randomBytes(3).toString("hex")}`;
	const makeWorkId = (): string => `${Date.now()}-${randomBytes(3).toString("hex")}`;

	// `bump` controls whether saving counts as "use": only actual runs (turn_end /
	// agent_end) bump updatedAt so the item is sorted as most recently used.
	// Switching away preserves the latest messages without reordering.
	const saveCurrentWork = async (bump = true): Promise<void> => {
		if (!currentWorkId) return;
		const existing = await sessionStore.load(currentWorkId);
		const item: WorkItem = {
			id: currentWorkId,
			title: existing?.title ?? "未命名工作项",
			cwd,
			model: agent.state.model,
			messages: agent.state.messages,
			todos: workTodos.todos,
			createdAt: existing?.createdAt ?? Date.now(),
			updatedAt: bump ? Date.now() : (existing?.updatedAt ?? Date.now()),
		};
		await sessionStore.save(item);
	};

	// Persist the current work item after each completed turn so an interrupted
	// run (no agent_end) does not lose the whole conversation. Debounced to
	// coalesce fast turns; agent_end and shutdown flush it immediately.
	let workSaveTimer: ReturnType<typeof setTimeout> | null = null;
	const scheduleWorkSave = (): void => {
		if (workSaveTimer) clearTimeout(workSaveTimer);
		workSaveTimer = setTimeout(() => {
			workSaveTimer = null;
			void saveCurrentWork().catch(() => {});
		}, 1500);
	};
	const flushWorkSave = async (bump = true): Promise<void> => {
		if (workSaveTimer) {
			clearTimeout(workSaveTimer);
			workSaveTimer = null;
		}
		await saveCurrentWork(bump);
	};

	const openWork = async (id: string): Promise<void> => {
		const item = await sessionStore.load(id);
		if (!item) return;
		if (currentWorkId) await saveCurrentWork(false);
		await agent.waitForIdle();
		workTodos.todos = item.todos.slice();
		agent.restore({ messages: item.messages, todos: item.todos });
		agent.setModel({ ...agent.state.model, reasoningEffort: workEffort(item) });
		currentWorkId = id;
		await sessionStore.setLastActive(id);
		// Re-sync the browser's model/effort display with the reopened work item.
		broadcast({ kind: "state", state: agent.state, work: null });
		broadcast({ kind: "works" });
	};

	// A request is trusted when it comes from the browser page we served
	// (same-origin) or carries the per-session token. Cross-site pages cannot
	// read the token (same-origin policy), so a forged request from a malicious
	// website is rejected even if it somehow reaches the local port.
	const isTrustedOrigin = (req: IncomingMessage): boolean => {
		const origin = req.headers.origin;
		if (!origin) return true; // non-browser client; token check below still applies
		try {
			const host = new URL(origin).host;
			return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
		} catch {
			return false;
		}
	};
	const requestToken = (req: IncomingMessage): string | undefined => {
		const header = req.headers["x-agent-token"];
		if (typeof header === "string" && header) return header;
		return new URL(req.url ?? "/", "http://localhost").searchParams.get("token") ?? undefined;
	};
	const isAuthorized = (req: IncomingMessage): boolean =>
		isTrustedOrigin(req) && requestToken(req) === token;
	const renderHtml = (): string => {
		let html = VIEW_HTML.replaceAll("__AGENT_TOKEN__", token);
		html = html.replace("__PLUGIN_SCRIPTS__", pluginTags);
		return html;
	};
	const renderJs = (): string => APP_JS.replaceAll("__AGENT_TOKEN__", token);

	const pluginsDir = join(process.cwd(), "plugins");
	let pluginTags = "";

	const scanPlugins = async (): Promise<void> => {
		const tags: string[] = [];
		try {
			const entries = await readdir(pluginsDir, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				try {
					await stat(join(pluginsDir, entry.name, "pet.js"));
					tags.push(`<script src="/plugins/${entry.name}/pet.js"></script>`);
				} catch { /* no pet.js, skip */ }
			}
		} catch { /* no plugins dir, skip */ }
		pluginTags = tags.join("\n");
	};

	const moduleDir = dirname(fileURLToPath(import.meta.url));
	const makeAssetLoader = (fileName: string) => {
		let cache: Buffer | null = null;
		let tried = false;
		return async (): Promise<Buffer | null> => {
			if (tried) return cache;
			tried = true;
			for (const base of [moduleDir, join(moduleDir, ".."), join(moduleDir, "../.."), cwd]) {
				try {
					cache = await readFile(join(base, fileName));
					break;
				} catch {
					// try next candidate
				}
			}
			if (!cache) tried = false;
			return cache;
		};
	};
	const loadFavicon = makeAssetLoader("favicon.ico");
	const loadLogo = makeAssetLoader("logo-2026.png");

	const broadcast = (payload: unknown): void => {
		const json = `data: ${JSON.stringify(payload)}\n\n`;
		for (const client of clients) {
			try {
				client.res.write(json);
			} catch {
				client.close();
				clients.delete(client);
			}
		}
	};

	const agent = createAgent({
		config,
		cwd,
		todoStore: workTodos,
		resolveAttachment: async (attachment) => {
			if (!currentWorkId) return null;
			return await attachmentStore.readBytes(currentWorkId, attachment.id);
		},
		beforeToolCall: createApprovalGate({
			workdir: cwd,
			ask: (request) => {
				return new Promise<boolean | "always">((resolve) => {
					pendingApprovals.set(request.requestId, resolve);
					broadcast({ kind: "approval", request });
				});
			},
		}),
	});

	agent.subscribe(async (event) => {
		broadcast({ kind: "event", runId: currentRunId, event });
	});

	agent.subscribe(async (event) => {
		if (event.type === "agent_start") {
			if (activeLog) await activeLog.finalize();
			currentRunId = makeRunId();
			activeLog = await EventLog.create({ dir: logDir, runId: currentRunId, model: agent.state.model.id });
			await activeLog.append(event);
			return;
		}
		if (!activeLog) return;
		await activeLog.append(event);
		if (event.type === "turn_end") {
			scheduleWorkSave();
		}
		if (event.type === "agent_end") {
			await activeLog.finalize();
			activeLog = null;
			await flushWorkSave();
			broadcast({ kind: "works" });
		}
	});

	const restoreStartupWork = async (): Promise<void> => {
		const items = await sessionStore.list();
		let item: WorkItem | null = null;
		const lastActive = await sessionStore.getLastActive();
		if (lastActive && items.some((i) => i.id === lastActive)) {
			item = (await sessionStore.load(lastActive)) ?? null;
		}
		if (!item) item = items[0] ?? null;
		if (item) {
			workTodos.todos = item.todos.slice();
			agent.restore({ messages: item.messages, todos: item.todos });
			agent.setModel({ ...agent.state.model, reasoningEffort: workEffort(item) });
			currentWorkId = item.id;
		} else {
			const id = makeWorkId();
			await sessionStore.save({
				id,
				title: "未命名工作项",
				cwd,
				model: agent.state.model,
				messages: [],
				todos: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			currentWorkId = id;
		}
		await sessionStore.setLastActive(currentWorkId);
	};
	await restoreStartupWork();
	await scanPlugins();

	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		const pathname = url.pathname;

		try {
			if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
				res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
				res.end(renderHtml());
				return;
			}
			if (req.method === "GET" && pathname === "/style.css") {
				res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-cache" });
				res.end(STYLE_CSS);
				return;
			}
			if (req.method === "GET" && pathname === "/app.js") {
				res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" });
				res.end(renderJs());
				return;
			}
			if (req.method === "GET" && pathname === "/favicon.ico") {
				const buf = await loadFavicon();
				if (!buf) {
					res.writeHead(404);
					res.end();
					return;
				}
				res.writeHead(200, { "content-type": "image/x-icon", "cache-control": "public, max-age=86400" });
				res.end(buf);
				return;
			}
			if (req.method === "GET" && pathname === "/logo-2026.png") {
				const buf = await loadLogo();
				if (!buf) {
					res.writeHead(404);
					res.end();
					return;
				}
				res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=86400" });
				res.end(buf);
				return;
			}

			if (req.method === "GET" && pathname.startsWith("/plugins/")) {
				const rel = pathname.slice("/plugins/".length);
				if (rel && !rel.includes("..")) {
					const filePath = join(pluginsDir, rel);
					try {
						const fileStat = await stat(filePath);
						if (fileStat.isFile()) {
							const data = await readFile(filePath);
							const ext = rel.split(".").pop()?.toLowerCase();
							const ct: Record<string, string> = { js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", webp: "image/webp", png: "image/png", jpg: "image/jpeg", ico: "image/x-icon", svg: "image/svg+xml" };
							const cacheHeader = ext === "js" || ext === "css" ? "no-cache" : "public, max-age=3600";
							res.writeHead(200, { "content-type": ct[ext ?? ""] ?? "application/octet-stream", "cache-control": cacheHeader });
							res.end(data);
							return;
						}
					} catch { /* not found */ }
				}
				res.writeHead(404);
				res.end();
				return;
			}

			if (pathname.startsWith("/api/") && !isAuthorized(req)) {
				writeJson(res, 403, { error: "Forbidden" });
				return;
			}

			if (pathname === "/api/events" && req.method === "GET") {
				res.writeHead(200, {
					"content-type": "text/event-stream; charset=utf-8",
					"cache-control": "no-cache",
					connection: "keep-alive",
				});
				await activeLog?.flush();
				res.write(": connected\n\n");
				const initialWork = currentWorkId ? await sessionStore.load(currentWorkId) : null;
				res.write(
					`data: ${JSON.stringify({
						kind: "state",
						state: agent.state,
						work: initialWork ? { id: initialWork.id, title: initialWork.title, messages: initialWork.messages } : null,
					})}\n\n`,
				);
				if (currentRunId) {
					for await (const entry of readRunEventsStream(logDir, currentRunId)) {
						res.write(`data: ${JSON.stringify({ kind: "replay", runId: entry.runId, event: entry.event })}\n\n`);
					}
				}
				const client: SseClient = {
					res,
					close: () => {
						try {
							res.end();
						} catch {
							// ignore
						}
					},
				};
				clients.add(client);
				req.on("close", () => clients.delete(client));
				return;
			}

			if (pathname === "/api/state" && req.method === "GET") {
				writeJson(res, 200, agent.state);
				return;
			}

			if (pathname === "/api/runs" && req.method === "GET") {
				writeJson(res, 200, { runs: await summarizeRuns(logDir), retentionDays: logRetentionDays });
				return;
			}

			// Batch delete. The selection travels in a JSON body; POST is accepted
			// as well because some proxies drop bodies from DELETE.
			if (pathname === "/api/runs" && (req.method === "DELETE" || req.method === "POST")) {
				const body = await readBody(req);
				const ids: unknown = body.runIds;
				const olderThanDays = typeof body.olderThanDays === "number" ? body.olderThanDays : null;
				let target: string[];
				if (Array.isArray(ids)) {
					if (ids.length > MAX_BATCH_DELETE) {
						writeJson(res, 400, { error: `一次最多删除 ${MAX_BATCH_DELETE} 条，请改用 olderThanDays 或 all。` });
						return;
					}
					if (ids.some((id) => typeof id !== "string" || !isSafeRunId(id))) {
						writeJson(res, 400, { error: "runIds 必须是合法的 run id 字符串数组" });
						return;
					}
					target = ids as string[];
				} else if (olderThanDays !== null && Number.isFinite(olderThanDays) && olderThanDays >= 0) {
					const cutoff = Date.now() - olderThanDays * 86_400_000;
					target = (await listRuns(logDir)).filter((m) => m.startTs < cutoff).map((m) => m.runId);
				} else if (body.all === true) {
					target = (await listRuns(logDir)).map((m) => m.runId);
				} else {
					writeJson(res, 400, { error: "需要提供 runIds、olderThanDays 或 all:true" });
					return;
				}
				// The run currently being written is never deleted; it is reported as
				// skipped instead of failing the whole batch.
				const result = await removeRuns(logDir, target, { exclude: activeLog ? [activeLog.runId] : [] });
				const remaining = (await listRuns(logDir)).length;
				writeJson(res, 200, { ok: true, deleted: result.deleted, skipped: result.skipped, remaining });
				return;
			}

			const runEventsMatch = pathname.match(/^\/api\/runs\/([0-9a-f-]+)\/events$/i);
			if (runEventsMatch && runEventsMatch[1] && req.method === "GET") {
				const runId = runEventsMatch[1];
				writeJson(res, 200, { runId, events: await readRunEvents(logDir, runId) });
				return;
			}

			const runDeleteMatch = pathname.match(/^\/api\/runs\/([0-9a-f-]+)$/i);
			if (runDeleteMatch && runDeleteMatch[1] && req.method === "DELETE") {
				const runId = runDeleteMatch[1];
				if (activeLog && activeLog.runId === runId) {
					writeJson(res, 409, { error: "Cannot delete the active run" });
					return;
				}
				const removed = await removeRun(logDir, runId);
				if (!removed) {
					writeJson(res, 404, { error: "Run not found" });
					return;
				}
				writeJson(res, 200, { ok: true });
				return;
			}

			if (pathname === "/api/send" && req.method === "POST") {
				const body = await readBody(req);
				const text = typeof body.text === "string" ? body.text.trim() : "";
				// Attachment ids previously uploaded for the current work item.
				const ids: unknown = body.attachments;
				const attachmentIds: string[] = Array.isArray(ids)
					? ids.filter((x): x is string => typeof x === "string" && !!x)
					: [];
				if (!text && attachmentIds.length === 0) {
					writeJson(res, 400, { error: "Empty message" });
					return;
				}
				const resolveAttachments = async (): Promise<UserMessage["attachments"]> => {
					if (!attachmentIds.length) return undefined;
					if (!currentWorkId) return undefined;
					const refs: UserMessage["attachments"] = [];
					for (const id of attachmentIds) {
						const meta = await attachmentStore.getMeta(currentWorkId, id);
						if (meta && meta.kind === "image") refs.push(meta);
					}
					return refs.length ? refs : undefined;
				};
				const userMessage: UserMessage = {
					role: "user",
					content: text,
					attachments: await resolveAttachments(),
					timestamp: Date.now(),
				};
				if (agent.streaming) {
					agent.steer(userMessage);
					writeJson(res, 200, { ok: true, queued: true });
				} else {
					void agent.prompt(userMessage).catch((error) => {
						broadcast({ kind: "error", message: error instanceof Error ? error.message : String(error) });
					});
					writeJson(res, 200, { ok: true });
				}
				return;
			}

			if (pathname === "/api/upload" && req.method === "POST") {
				if (!currentWorkId) {
					writeJson(res, 400, { error: "No active work item" });
					return;
				}
				const name = url.searchParams.get("name") ?? "image";
				const mime = url.searchParams.get("mime") ?? "application/octet-stream";
				if (!mime.startsWith("image/")) {
					writeJson(res, 400, { error: "Only image files are supported for now" });
					return;
				}
				const bytes = await readRawBody(req, MAX_UPLOAD_BYTES);
				if (!bytes) {
					writeJson(res, 413, { error: `File too large (limit ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB)` });
					return;
				}
				const attachment = await attachmentStore.save(currentWorkId, { name, mime, kind: "image" }, bytes);
				writeJson(res, 200, { ok: true, attachment });
				return;
			}

			const attachmentMatch = pathname.match(/^\/api\/attachments\/([^/]+)\/([^/]+)$/);
			if (attachmentMatch && attachmentMatch[1] && attachmentMatch[2] && req.method === "GET") {
				const [workId, id] = [attachmentMatch[1], attachmentMatch[2]];
				const meta = await attachmentStore.getMeta(workId, id);
				const bytes = meta ? await attachmentStore.readBytes(workId, id) : null;
				if (!meta || !bytes) {
					writeJson(res, 404, { error: "Attachment not found" });
					return;
				}
				res.writeHead(200, {
					"content-type": meta.mime,
					"content-length": bytes.byteLength,
					"cache-control": "private, max-age=3600",
				});
				res.end(Buffer.from(bytes));
				return;
			}

			if (pathname === "/api/abort" && req.method === "POST") {
				agent.abort();
				if (pendingApprovals.size > 0) {
					for (const [requestId, resolve] of pendingApprovals) {
						pendingApprovals.delete(requestId);
						resolve(false);
					}
					broadcast({ kind: "approval", request: null });
				}
				writeJson(res, 200, { ok: true });
				return;
			}

			if (pathname === "/api/clear" && req.method === "POST") {
				if (agent.streaming) {
					writeJson(res, 409, { error: "Agent is busy; abort first." });
				} else {
					agent.resetTranscript();
					writeJson(res, 200, { ok: true });
				}
				return;
			}

			if (pathname === "/api/model" && req.method === "POST") {
				const body = await readBody(req);
				if (typeof body.model === "string" && body.model.trim()) {
					agent.setModel({ ...agent.state.model, id: body.model.trim() });
				}
				writeJson(res, 200, { ok: true, model: agent.state.model.id });
				return;
			}

			if (pathname === "/api/reasoning" && req.method === "POST") {
				const body = await readBody(req);
				const effort = normalizeReasoningEffort(body.effort);
				if (effort) {
					agent.setModel({ ...agent.state.model, reasoningEffort: effort });
					writeJson(res, 200, { ok: true, reasoningEffort: effort });
				} else {
					writeJson(res, 400, { error: `Invalid effort: ${String(body.effort)}` });
				}
				return;
			}

			if (pathname === "/api/approve" && req.method === "POST") {
				const body = await readBody(req);
				const requestId = typeof body.requestId === "string" ? body.requestId : "";
				const mode = body.mode;
				let value: boolean | "always" = true;
				if (mode === "always") value = "always";
				else if (mode === "deny" || body.approve === false) value = false;
				const resolve = requestId ? pendingApprovals.get(requestId) : undefined;
				if (resolve) {
					pendingApprovals.delete(requestId);
					resolve(value);
					writeJson(res, 200, { ok: true });
				} else {
					writeJson(res, 404, { error: `No pending approval: ${requestId}` });
				}
				return;
			}

			if (pathname === "/api/works" && req.method === "GET") {
				// Sorted by updatedAt (most recently used first); plain clicking /
				// switching does not bump updatedAt, only actual runs do.
				writeJson(res, 200, { works: await sessionStore.list(), current: currentWorkId });
				return;
			}

			if (pathname === "/api/works" && req.method === "POST") {
				if (agent.streaming) {
					writeJson(res, 409, { error: "Agent is busy; abort first." });
					return;
				}
				const body = await readBody(req);
				const title = typeof body.title === "string" ? body.title.trim() : "";
				const id = makeWorkId();
				await sessionStore.save({
					id,
					title: title || "未命名工作项",
					cwd,
					model: agent.state.model,
					messages: [],
					todos: [],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				await openWork(id);
				writeJson(res, 200, { ok: true, id });
				return;
			}

			const workOpenMatch = pathname.match(/^\/api\/works\/([^/]+)\/open$/);
			if (workOpenMatch && workOpenMatch[1] && req.method === "POST") {
				const id = workOpenMatch[1];
				const item = await sessionStore.load(id);
				if (!item) {
					writeJson(res, 404, { error: "Work item not found" });
					return;
				}
				await openWork(id);
				writeJson(res, 200, { ok: true, work: item });
				return;
			}

			const workRenameMatch = pathname.match(/^\/api\/works\/([^/]+)\/rename$/);
			if (workRenameMatch && workRenameMatch[1] && req.method === "POST") {
				const id = workRenameMatch[1];
				const body = await readBody(req);
				const title = typeof body.title === "string" ? body.title.trim() : "";
				if (!title) {
					writeJson(res, 400, { error: "Title required" });
					return;
				}
				const item = await sessionStore.load(id);
				if (!item) {
					writeJson(res, 404, { error: "Work item not found" });
					return;
				}
				item.title = title;
				await sessionStore.save(item);
				writeJson(res, 200, { ok: true });
				return;
			}

			const workDeleteMatch = pathname.match(/^\/api\/works\/([^/]+)$/);
			if (workDeleteMatch && workDeleteMatch[1] && req.method === "DELETE") {
				const id = workDeleteMatch[1];
				if (agent.streaming) {
					writeJson(res, 409, { error: "Agent is busy; abort first." });
					return;
				}
				await agent.waitForIdle();
				let active: WorkItem | null = null;
				if (currentWorkId === id) {
					const items = await sessionStore.list();
					const next = items.filter((i) => i.id !== id).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
					if (next) {
						active = await sessionStore.load(next.id);
						workTodos.todos = active ? active.todos.slice() : [];
						agent.restore({ messages: active ? active.messages : [], todos: workTodos.todos });
						currentWorkId = next.id;
					} else {
						const freshId = makeWorkId();
						active = {
							id: freshId,
							title: "未命名工作项",
							cwd,
							model: agent.state.model,
							messages: [],
							todos: [],
							createdAt: Date.now(),
							updatedAt: Date.now(),
						};
						await sessionStore.save(active);
						workTodos.todos = [];
						agent.restore({ messages: [], todos: [] });
						currentWorkId = freshId;
					}
				}
				await sessionStore.remove(id);
				await attachmentStore.removeWork(id);
				await sessionStore.setLastActive(currentWorkId);
				broadcast({ kind: "works" });
				writeJson(res, 200, { ok: true, work: active });
				return;
			}

			writeJson(res, 404, { error: "Not found" });
		} catch (error) {
			writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
		}
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => resolve());
	});

	const url = `http://127.0.0.1:${port}`;
	console.log(`tju-code GUI: ${url}`);
	console.log(`Model: ${config.api} / ${config.model}`);
	console.log(`Session token: ${token} (required for /api/* requests)`);
	console.log("Press Ctrl+C to stop.");

	if (open) {
		await openBrowser(url);
	}

	// Graceful shutdown: flush the current work item so a Ctrl+C / SIGTERM exit
	// does not lose the latest turns (the per-turn debounce is not awaited).
	const shutdown = (): void => {
		void (async () => {
			try {
				await flushWorkSave(false);
			} catch {
				// best effort on exit
			}
			process.exit(0);
		})();
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

/** Reasoning effort recorded with a work item; items saved before the setting default to "high". */
function workEffort(item: WorkItem): ReasoningEffort {
	return normalizeReasoningEffort(item.model?.reasoningEffort) ?? "high";
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 1024 * 1024; // bound JSON request bodies
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // single image upload limit (30 MiB)
/** Upper bound on an explicit id list; condition-based deletes are uncapped. */
const MAX_BATCH_DELETE = 500;

/** Read a raw (non-JSON) request body as bytes, bounded to `limit`. Returns
 * null when the body is empty or exceeds the limit. */
function readRawBody(req: IncomingMessage, limit: number): Promise<Uint8Array | null> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		let total = 0;
		let overflow = false;
		req.on("data", (chunk: Buffer) => {
			total += chunk.length;
			if (total > limit) {
				overflow = true;
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("error", () => resolve(null));
		req.on("end", () => {
			if (overflow || chunks.length === 0) {
				resolve(null);
				return;
			}
			resolve(Buffer.concat(chunks));
		});
	});
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		let total = 0;
		let overflow = false;
		req.on("data", (chunk: Buffer) => {
			total += chunk.length;
			if (total > MAX_BODY_BYTES) {
				overflow = true;
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("error", () => resolve({}));
		req.on("end", () => {
			if (overflow) {
				resolve({});
				return;
			}
			const text = Buffer.concat(chunks).toString("utf-8");
			try {
				resolve(JSON.parse(text) as Record<string, unknown>);
			} catch {
				resolve({});
			}
		});
	});
}

async function openBrowser(url: string): Promise<void> {
	const { spawn } = await import("node:child_process");
	try {
		if (process.platform === "win32") {
			spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
		} else if (process.platform === "darwin") {
			spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
		} else {
			spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
		}
	} catch {
		// Browser open failed; the URL is already printed above.
	}
}
