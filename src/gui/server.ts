import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgentTools, createAgent, type CreateAgentOptions } from "../create-agent.ts";
import { PROVIDER_ENTRIES } from "../config.ts";
import { describeDataRoot, resolveDataRoot } from "../data-root.ts";
import {
	deleteUserEntry,
	loadProviderTable,
	probeModels,
	readSecrets,
	resolveEntryKey,
	resolveInterface,
	upsertUserEntry,
	writeSecret,
	type UserProviderEntry,
} from "../providers.ts";
import { cleanupRuns, EventLog, isSafeRunId, listRuns, readRunEvents, readRunEventsStream, removeRun, removeRuns, summarizeRuns } from "../core/event-log.ts";
import { createApprovalGate, type ApprovalAnswer, type ApprovalRequest } from "../core/permission.ts";
import { SessionStore, type WorkItem } from "../core/session-store.ts";
import { normalizeReasoningEffort, type ReasoningEffort } from "../core/reasoning-effort.ts";
import type { CliFlags, RunConfig } from "../config.ts";
import type { TodoStore, UserMessage } from "../core/types.ts";
import { APP_JS, STYLE_CSS, VIEW_HTML } from "./ui.ts";
import { AttachmentStore } from "./attachment-store.ts";
import { checkCwdConfirm, listChildDirs, resolveWorkdirInput, type CwdPending } from "./workdir.ts";
import { APP_VERSION } from "../version.ts";
import {
	checkForUpdate,
	compareVersions,
	fetchManifest,
	hasBackup,
	relaunch,
	resolveInstallRoot,
	stageRelease,
	stagingDirFor,
	swapRollback,
	swapToRelease,
} from "../update.ts";

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
	const pendingApprovals = new Map<string, { resolve: (mode: ApprovalAnswer) => void; request: ApprovalRequest }>();
	const pendingCwd = new Map<string, CwdPending>();
	const CWD_PENDING_TTL_MS = 10 * 60 * 1000;
	const pendingQuestions = new Map<
		string,
		{ resolve: (choice: string | null) => void; request: { requestId: string; question: string; options: string[] } }
	>();
	const token = randomBytes(16).toString("hex");
	const confirmNonce = randomBytes(16).toString("hex");

	const dataRoot = resolveDataRoot();
	const logDir = config.logDir ?? join(dataRoot, "logs");
	const logRetentionDays = config.logRetentionDays ?? 7;
	await cleanupRuns(logDir, logRetentionDays);

	const sessionDir = config.sessionDir ?? join(dataRoot, "works");
	const sessionStore = new SessionStore({ dir: sessionDir });
	const attachmentStore = new AttachmentStore(join(dataRoot, "attachments"));
	const workTodos: TodoStore = { todos: [] };
	let currentWorkId: string | null = null;
	let currentRunId: string | null = null;
	let activeLog: EventLog | null = null;
	let updating = false;
	let pendingRestart = false;

	const makeRunId = (): string => `${Date.now()}-${randomBytes(3).toString("hex")}`;
	const makeWorkId = (): string => `${Date.now()}-${randomBytes(3).toString("hex")}`;

	const trackWork = (id: string): void => {
		currentWorkId = id;
		agent.provider.sessionId = id;
	};

	// `bump` controls whether saving counts as "use": only actual runs (turn_end /
	// agent_end) bump updatedAt so the item is sorted as most recently used.
	// Switching away preserves the latest messages without reordering.
	const saveCurrentWork = async (bump = true): Promise<void> => {
		if (!currentWorkId) return;
		const existing = await sessionStore.load(currentWorkId);
		const item: WorkItem = {
			id: currentWorkId,
			title: existing?.title ?? "未命名工作项",
			cwd: activeCwd,
			model: agent.state.model,
			providerEntryId: agent.provider.entryId,
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

	const restoreProvider = (entryId: string | undefined, modelId: string | undefined): boolean => {
		if (!entryId) return false;
		const loaded = loadProviderTable(PROVIDER_ENTRIES);
		const resolved = resolveInterface(loaded.table, entryId, modelId, process.env, readSecrets());
		if ("error" in resolved) return true;
		agent.setProvider({
			model: { ...agent.state.model, ...resolved.model },
			apiKey: resolved.apiKey,
			entryId: resolved.entryId,
		});
		return false;
	};

	const openWork = async (id: string): Promise<{ providerFallback: boolean }> => {
		const item = await sessionStore.load(id);
		if (!item) return { providerFallback: false };
		if (currentWorkId) await saveCurrentWork(false);
		await agent.waitForIdle();
		workTodos.todos = item.todos.slice();
		agent.restore({ messages: item.messages, todos: item.todos });
		await applyCwd(item.cwd || cwd);
		const fellBack = restoreProvider(item.providerEntryId, item.model?.id);
		agent.setModel({ ...agent.state.model, reasoningEffort: workEffort(item) });
		trackWork(id);
		await sessionStore.setLastActive(id);
		// Re-sync the browser's model/effort display with the reopened work item.
		broadcast({ kind: "state", state: agent.state, work: null });
		broadcast({ kind: "works" });
		return { providerFallback: fellBack };
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
		return undefined;
	};
	const isAuthorized = (req: IncomingMessage): boolean =>
		isTrustedOrigin(req) && requestToken(req) === token;

	/** Authorized through a short-lived attachment ticket instead of the token. */
	const isTicketAuthorized = (req: IncomingMessage, ticket: string | null): boolean => {
		if (!isTrustedOrigin(req) || !ticket) return false;
		const expires = attachmentTickets.get(ticket);
		if (expires === undefined) return false;
		if (expires <= Date.now()) {
			attachmentTickets.delete(ticket);
			return false;
		}
		return true;
	};
	const renderHtml = (): string => {
		let html = VIEW_HTML.replaceAll("__AGENT_TOKEN__", token);
		html = html.replace("__PLUGIN_SCRIPTS__", pluginTags);
		return html;
	};
	const renderJs = (): string => APP_JS.replaceAll("__AGENT_TOKEN__", token);

	// Short-lived tickets for URLs that cannot carry headers (attachment images
	// referenced from `<img src>`, and the event stream). The session token itself
	// is never accepted from a query string.
	const attachmentTickets = new Map<string, number>();
	const ATTACHMENT_TICKET_TTL_MS = 10 * 60 * 1000;
	const issueAttachmentTicket = (): string => {
		const now = Date.now();
		for (const [id, expires] of attachmentTickets) {
			if (expires <= now) attachmentTickets.delete(id);
		}
		const id = randomBytes(16).toString("hex");
		attachmentTickets.set(id, now + ATTACHMENT_TICKET_TTL_MS);
		return id;
	};

	const pluginsDir = join(cwd, "plugins");
	const pluginRelDirs: string[] = [];
	let pluginTags = "";
	const pluginNames: string[] = [];

	// Plugin scripts run in the GUI's own origin and can therefore read the
	// session token and drive the agent (approve directory access, exfiltrate the
	// transcript). The plugin directory lives in the agent's writable workspace,
	// so "auto-load whatever is on disk" would turn any file write — including one
	// done under prompt injection — into code execution in this origin. Hence the
	// allowlist is computed once, at startup, from the directories present then:
	// adding a plugin requires a restart, which the CLI announces below.
	const scanPlugins = async (): Promise<Set<string>> => {
		const allowed = new Set<string>();
		let entries;
		try {
			entries = await readdir(pluginsDir, { withFileTypes: true });
		} catch {
			return allowed; // no plugins dir, skip
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith(".") || entry.name.includes("..")) continue;
			const relDir = entry.name;
			try {
				const info = await stat(join(pluginsDir, relDir, ENTRY_FILE));
				if (!info.isFile()) continue;
			} catch {
				continue; // no entry file, skip
			}
			// Every file inside the plugin directory is enumerable by the route
			// below, so the allowlist covers the whole tree, not just the entry.
			for (const rel of await listPluginFiles(relDir)) {
				allowed.add(`${relDir}/${rel}`);
			}
			pluginRelDirs.push(relDir);
			pluginNames.push(relDir);
			// `relDir` comes from the filesystem, so it is escaped before being
			// embedded in HTML:
			// a directory name may legally contain `"` on Linux/macOS, which
			// would otherwise close the attribute and inject markup.
			const src = `/plugins/${relDir.split("/").map(encodeURIComponent).join("/")}/${ENTRY_FILE}`;
			pluginTags += `<script src="${escHtml(src)}"></script>\n`;
		}
		return allowed;
	};

	// Only plugin files that already existed when the process started are served,
	// and never after the process exits: the agent has write access to the
	// workspace, so a plugin written mid-session must not become executable in
	// the GUI origin without the user restarting and thus re-consenting.
	const allowedPluginFiles = await scanPlugins();

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

	const makeApprovalGate = (dir: string): NonNullable<CreateAgentOptions["beforeToolCall"]> =>
		createApprovalGate({
			workdir: dir,
			ask: (request) => {
				return new Promise<ApprovalAnswer>((resolve) => {
					pendingApprovals.set(request.requestId, { resolve, request });
					broadcast({ kind: "approval", request });
				});
			},
		});

	const askUserHandler: NonNullable<CreateAgentOptions["askUser"]> = (request, signal) => {
		return new Promise<string>((resolve, reject) => {
			const toolCallId = `${Date.now()}-${randomBytes(3).toString("hex")}`;
			const full = { requestId: toolCallId, ...request };
			pendingQuestions.set(toolCallId, {
				resolve: (choice) => {
					if (choice === null) reject(new Error("Question cancelled"));
					else resolve(choice);
				},
				request: full,
			});
			signal?.addEventListener("abort", () => {
				if (pendingQuestions.delete(toolCallId)) reject(new Error("Question cancelled"));
			}, { once: true });
			broadcast({ kind: "question", request: full });
		});
	};

	const agent = createAgent({
		config,
		cwd,
		todoStore: workTodos,
		resolveAttachment: async (attachment) => {
			if (!currentWorkId) return null;
			return await attachmentStore.readBytes(currentWorkId, attachment.id);
		},
		beforeToolCall: makeApprovalGate(cwd),
		askUser: askUserHandler,
	});

	let activeCwd = cwd;
	const sameDir = (a: string, b: string): boolean => {
		if (process.platform === "win32") {
			a = a.toLowerCase();
			b = b.toLowerCase();
		}
		return a.replace(/[\\/]+$/, "") === b.replace(/[\\/]+$/, "");
	};
	const applyCwd = async (dir: string): Promise<void> => {
		if (!dir || sameDir(dir, activeCwd)) return;
		const checked = await resolveWorkdirInput(dir);
		if (checked.error || !checked.dir) {
			console.error(`[warn] 工作项工作目录无效（${checked.error ?? "未知错误"}），已保留原目录 ${activeCwd}`);
			return;
		}
		const gate = makeApprovalGate(checked.dir);
		agent.setBeforeToolCall(gate);
		agent.setTools(
			buildAgentTools(agent, {
				cwd: checked.dir,
				maxTokens: config.maxTokens,
				todoStore: workTodos,
				beforeToolCall: gate,
				askUser: askUserHandler,
			}),
		);
		activeCwd = checked.dir;
	};

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
			await applyCwd(item.cwd || cwd);
			// A hand-written --profile or a freshly imported/refreshed launcher
			// entry expresses which interface to use right now and wins over the
			// stored work item; otherwise the previous session's interface would
			// silently override every freshly double-clicked launcher script. A
			// profile carried over from an unchanged script (kept) or the empty-
			// script fallback is stale by definition: the work item's own saved
			// interface (i.e. the last dropdown pick) wins instead.
			const explicitProfile =
				typeof flags.profile === "string" && !!flags.profile && !flags.launcherProfileStale;
			if (!explicitProfile && restoreProvider(item.providerEntryId, item.model?.id)) {
				console.error(`[warn] work item "${item.title}" 的接口已不存在，已切到默认接口`);
			}
			agent.setModel({ ...agent.state.model, reasoningEffort: workEffort(item) });
			trackWork(item.id);
		} else {
			// No work items at all: nothing to restore from, so honor the startup
			// profile (hand-written, fresh launcher import, or fallback) as-is.
			if (typeof flags.profile === "string" && flags.profile) {
				restoreProvider(flags.profile, undefined);
			}
			const id = makeWorkId();
			await sessionStore.save({
				id,
				title: "未命名工作项",
				cwd: activeCwd,
				model: agent.state.model,
				messages: [],
				todos: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			trackWork(id);
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
				res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", ...SECURITY_HEADERS });
				res.end(renderHtml());
				return;
			}
			if (req.method === "GET" && pathname === "/style.css") {
				res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-cache", ...SECURITY_HEADERS });
				res.end(STYLE_CSS);
				return;
			}
			if (req.method === "GET" && pathname === "/app.js") {
				res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache", ...SECURITY_HEADERS });
				res.end(renderJs());
				return;
			}
			if (req.method === "GET" && pathname === "/favicon.ico") {
				const buf = await loadFavicon();
				if (!buf) {
					res.writeHead(404, SECURITY_HEADERS);
					res.end();
					return;
				}
				res.writeHead(200, { "content-type": "image/x-icon", "cache-control": "public, max-age=86400", ...SECURITY_HEADERS });
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
				res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=86400", ...SECURITY_HEADERS });
				res.end(buf);
				return;
			}

			if (req.method === "GET" && pathname.startsWith("/plugins/")) {
				// Decoded once, then matched against the startup allowlist, so the
				// filesystem is never touched with a caller-supplied path: a
				// traversal attempt simply is not in the set.
				let rel: string;
				try {
					rel = decodeURIComponent(pathname.slice("/plugins/".length));
				} catch {
					rel = "";
				}
				const ext = rel.split(".").pop()?.toLowerCase() ?? "";
				if (rel && allowedPluginFiles.has(rel) && PLUGIN_MIME[ext]) {
					try {
						const data = await readFile(join(pluginsDir, ...rel.split("/")));
						const cacheHeader = ext === "js" || ext === "css" ? "no-cache" : "public, max-age=3600";
						res.writeHead(200, {
							"content-type": PLUGIN_MIME[ext] ?? "application/octet-stream",
							"cache-control": cacheHeader,
							...SECURITY_HEADERS,
						});
						res.end(data);
						return;
					} catch {
						// fall through to 404
					}
				}
				res.writeHead(404, SECURITY_HEADERS);
				res.end();
				return;
			}

			// The one route reachable without the token header: `<img src>` cannot
			// set headers, so it authenticates with a short-lived ticket instead.
			// It has to be exempted *here*, before the generic token check, or the
			// request would be rejected as unauthorized and never reach its handler.
			const isTicketOnlyRequest =
				req.method === "GET" &&
				pathname.startsWith("/api/attachments/") &&
				isTicketAuthorized(req, url.searchParams.get("t"));

			if (pathname.startsWith("/api/") && !isAuthorized(req) && !isTicketOnlyRequest) {
				writeJson(res, 403, { error: "Forbidden" });
				return;
			}

			if (pathname === "/api/events" && req.method === "GET") {
				res.writeHead(200, {
					"content-type": "text/event-stream; charset=utf-8",
					"cache-control": "no-cache",
					connection: "keep-alive",
					...SECURITY_HEADERS,
				});
				await activeLog?.flush();
				res.write(": connected\n\n");
				const initialWork = currentWorkId ? await sessionStore.load(currentWorkId) : null;
				res.write(
					`data: ${JSON.stringify({
						kind: "state",
						state: agent.state,
						// Handed out over the stream so `<img>` URLs for attachments
						// can be authorized without the session token ever appearing
						// in a URL (see issueAttachmentTicket).
						ticket: issueAttachmentTicket(),
						work: initialWork ? { id: initialWork.id, title: initialWork.title, messages: initialWork.messages } : null,
					})}\n\n`,
				);
				if (currentRunId) {
					for await (const entry of readRunEventsStream(logDir, currentRunId)) {
						res.write(`data: ${JSON.stringify({ kind: "replay", runId: entry.runId, event: entry.event })}\n\n`);
					}
				}
				// A refresh while the run waits on the user would otherwise lose
				// the prompt with no way to get it back: re-issue anything still
				// pending so the reconnected page can answer it.
				for (const [, pending] of pendingApprovals) {
					res.write(`data: ${JSON.stringify({ kind: "approval", request: pending.request })}\n\n`);
				}
				for (const [, pending] of pendingQuestions) {
					res.write(`data: ${JSON.stringify({ kind: "question", request: pending.request })}\n\n`);
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

			// Ticket for URL-borne (header-less) requests. Issued on demand so the
			// page does not have to know about the event stream to get one.
			if (pathname === "/api/ticket" && req.method === "POST") {
				writeJson(res, 200, { ticket: issueAttachmentTicket() });
				return;
			}

			if (pathname === "/api/state" && req.method === "GET") {
				writeJson(res, 200, agent.state);
				return;
			}

			if (pathname === "/api/cwd" && req.method === "GET") {
				writeJson(res, 200, { ok: true, cwd });
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
				// The extension decides, but pasted clipboard images often carry no
				// filename at all (client falls back to "image-N"): fall back to
				// the declared mime in that case instead of rejecting the upload.
				// Either way the stored mime comes from our own table, never from
				// the client string, so SVG-as-image stays excluded.
				const mimeByExt: Record<string, string> = {
					png: "image/png",
					jpg: "image/jpeg",
					jpeg: "image/jpeg",
					gif: "image/gif",
					webp: "image/webp",
				};
				const ext = (name.split(".").pop() ?? "").toLowerCase();
				let storedMime = mimeByExt[ext];
				if (!storedMime) {
					const declared = mime.toLowerCase().split(";")[0]?.trim() ?? "";
					const extByMime: Record<string, string> = {
						"image/png": "image/png",
						"image/jpeg": "image/jpeg",
						"image/gif": "image/gif",
						"image/webp": "image/webp",
					};
					storedMime = extByMime[declared];
					if (!storedMime) {
						writeJson(res, 400, { error: `不支持的文件类型（仅支持 png/jpg/gif/webp）：${name}` });
						return;
					}
				}
				const bytes = await readRawBody(req, MAX_UPLOAD_BYTES);
				if (!bytes) {
					writeJson(res, 413, { error: `File too large (limit ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB)` });
					return;
				}
				const attachment = await attachmentStore.save(currentWorkId, { name, mime: storedMime, kind: "image" }, bytes);
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
					...SECURITY_HEADERS,
				});
				res.end(Buffer.from(bytes));
				return;
			}

			if (pathname === "/api/abort" && req.method === "POST") {
				agent.abort();
				if (pendingApprovals.size > 0) {
					for (const [requestId, pending] of pendingApprovals) {
						pendingApprovals.delete(requestId);
						pending.resolve(false);
					}
					broadcast({ kind: "approval", request: null });
				}
				if (pendingQuestions.size > 0) {
					for (const [, pending] of pendingQuestions) {
						pending.resolve(null);
					}
					pendingQuestions.clear();
					broadcast({ kind: "question", request: null });
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

			if (pathname === "/api/revert" && req.method === "POST") {
				const body = await readBody(req);
				const timestamp = typeof body.timestamp === "number" ? body.timestamp : NaN;
				if (!Number.isFinite(timestamp)) {
					writeJson(res, 400, { error: "需要提供 timestamp" });
					return;
				}
				if (agent.streaming) {
					writeJson(res, 409, { error: "任务执行中，请先停止后再回退" });
					return;
				}
				const target = agent.state.messages.find((m) => m.timestamp === timestamp);
				const restored =
					target && target.role === "user"
						? { text: target.content, attachments: target.attachments ?? [] }
						: null;
				try {
					agent.revertTo(timestamp);
				} catch (err) {
					writeJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
					return;
				}
				await saveCurrentWork();
				writeJson(res, 200, { ok: true, messages: agent.state.messages, restored });
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

			if (pathname === "/api/providers" && req.method === "GET") {
				const loaded = loadProviderTable(PROVIDER_ENTRIES);
				const secrets = readSecrets();
				writeJson(res, 200, {
					entries: Object.values(loaded.table).map((e) => ({
						id: e.id,
						label: e.label,
						api: e.api,
						provider: e.provider,
						baseUrl: e.baseUrl,
						defaultModel: e.defaultModel,
						models: e.models,
						source: e.source ?? "builtin",
						keyEnv: e.keyEnv,
						hasKey: !!resolveEntryKey(e, process.env, secrets),
					})),
					current: { entryId: agent.provider.entryId ?? null, modelId: agent.state.model.id },
					warnings: loaded.warnings,
				});
				return;
			}

			if (pathname === "/api/provider" && req.method === "POST") {
				const body = await readBody(req);
				const entryId = typeof body.entryId === "string" ? body.entryId : "";
				const modelId = typeof body.model === "string" ? body.model : undefined;
				if (!entryId) {
					writeJson(res, 400, { error: "需要 entryId" });
					return;
				}
				const loaded = loadProviderTable(PROVIDER_ENTRIES);
				const resolved = resolveInterface(loaded.table, entryId, modelId, process.env, readSecrets());
				if ("error" in resolved) {
					writeJson(res, 400, { error: resolved.error });
					return;
				}
				agent.setProvider({
					model: { ...agent.state.model, ...resolved.model },
					apiKey: resolved.apiKey,
					entryId: resolved.entryId,
				});
				await saveCurrentWork(false);
				broadcast({ kind: "state", state: agent.state, work: null });
				writeJson(res, 200, { ok: true, entryId: resolved.entryId, model: agent.state.model.id });
				return;
			}

			if (pathname === "/api/providers" && req.method === "POST") {
				const body = await readBody(req);
				const result = upsertUserEntry(PROVIDER_ENTRIES, body.entry as UserProviderEntry);
				if ("error" in result) {
					writeJson(res, 400, { error: result.error });
					return;
				}
				writeJson(res, 200, { ok: true });
				return;
			}

			const providerDeleteMatch = pathname.match(/^\/api\/providers\/([^/]+)$/);
			if (providerDeleteMatch && providerDeleteMatch[1] && req.method === "DELETE") {
				const result = deleteUserEntry(decodePathSegment(providerDeleteMatch[1]));
				if ("error" in result) {
					writeJson(res, 400, { error: result.error });
					return;
				}
				writeJson(res, 200, { ok: true });
				return;
			}

			if (pathname === "/api/providers/test" && req.method === "POST") {
				const body = await readBody(req);
				const raw = (body.entry ?? null) as UserProviderEntry | null;
				if (!raw || typeof raw !== "object") {
					writeJson(res, 400, { error: "需要 entry 对象才能测试" });
					return;
				}
				const api = raw && (raw.api === "openai-completions" || raw.api === "anthropic-messages") ? raw.api : undefined;
				const baseUrl = raw && typeof raw.baseUrl === "string" ? raw.baseUrl : "";
				if (!api || !baseUrl) {
					writeJson(res, 400, { error: "需要合法的 api 与 baseUrl 才能测试" });
					return;
				}
				const key =
					typeof body.key === "string" && body.key
						? body.key
						: resolveEntryKey(
								{
									id: typeof raw.id === "string" ? raw.id : "",
									label: "",
									api,
									provider: "",
									baseUrl,
									defaultModel: "",
									keyEnv: typeof raw.keyEnv === "string" ? raw.keyEnv : undefined,
								},
								process.env,
								readSecrets(),
							);
				const model = raw && typeof raw.defaultModel === "string" ? raw.defaultModel : undefined;
				writeJson(res, 200, await probeModels({ api, baseUrl, model }, key));
				return;
			}

			if (pathname === "/api/providers/key" && req.method === "POST") {
				const body = await readBody(req);
				const entryId = typeof body.entryId === "string" ? body.entryId : "";
				if (!entryId) {
					writeJson(res, 400, { error: "需要 entryId" });
					return;
				}
				// Only ids that exist in the merged table (builtin + user) may be
				// written, so secrets.json cannot accumulate arbitrary attacker-named
				// keys — it is read into memory on every provider resolution.
				if (!loadProviderTable(PROVIDER_ENTRIES).table[entryId]) {
					writeJson(res, 404, { error: `未知接口：${entryId}` });
					return;
				}
				const key = typeof body.key === "string" && body.key ? body.key : null;
				if (key !== null && (key.length > MAX_SECRET_CHARS || key.includes("\n") || key.includes("\r"))) {
					writeJson(res, 400, { error: "API key 长度或格式非法" });
					return;
				}
				try {
					writeSecret(entryId, key);
				} catch (err) {
					writeJson(res, 500, { error: `写入失败：${err instanceof Error ? err.message : String(err)}` });
					return;
				}
				writeJson(res, 200, { ok: true });
				return;
			}
			if (pathname === "/api/version" && req.method === "GET") {
				let root: string | null = null;
				try {
					root = resolveInstallRoot().root;
				} catch {
					root = null;
				}
				writeJson(res, 200, {
					version: APP_VERSION,
					updateUrl: !!config.updateUrl,
					hasBackup: root ? hasBackup(root) : false,
					pendingRestart,
				});
				return;
			}

			if (pathname === "/api/update/check" && req.method === "GET") {
				if (!config.updateUrl) {
					writeJson(res, 200, { current: APP_VERSION, available: false, error: "未配置更新源（TJU_UPDATE_URL / --update-url）" });
					return;
				}
				try {
					const info = await checkForUpdate(config.updateUrl, APP_VERSION);
					writeJson(res, 200, info);
				} catch (err) {
					writeJson(res, 200, { current: APP_VERSION, available: false, error: err instanceof Error ? err.message : String(err) });
				}
				return;
			}

			if (pathname === "/api/update/apply" && req.method === "POST") {
				if (!config.updateUrl) {
					writeJson(res, 400, { error: "未配置更新源（TJU_UPDATE_URL / --update-url）" });
					return;
				}
				if (agent.streaming) {
					writeJson(res, 409, { error: "任务执行中，请等本轮结束后再更新" });
					return;
				}
				if (updating) {
					writeJson(res, 409, { error: "已有更新正在进行，请勿重复点击" });
					return;
				}
				if (pendingRestart) {
					writeJson(res, 409, { error: "新版本已就绪，请先重启生效" });
					return;
				}
				let root: string;
				try {
					root = resolveInstallRoot().root;
				} catch (err) {
					writeJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
					return;
				}
				updating = true;
				try {
					const manifest = await fetchManifest(config.updateUrl);
					if (compareVersions(manifest.version, APP_VERSION) <= 0) {
						updating = false;
						writeJson(res, 200, { ok: false, current: APP_VERSION, latest: manifest.version, message: "已是最新版本" });
						return;
					}
					const staging = stagingDirFor(root);
					await stageRelease(config.updateUrl, manifest, staging);
					await swapToRelease(root, staging);
					updating = false;
					pendingRestart = true;
					writeJson(res, 200, { ok: true, version: manifest.version, needRestart: true });
				} catch (err) {
					updating = false;
					writeJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
				}
				return;
			}

			if (pathname === "/api/update/restart" && req.method === "POST") {
				if (agent.streaming) {
					writeJson(res, 409, { error: "任务执行中，请等本轮结束后再重启" });
					return;
				}
				let root: string;
				try {
					root = resolveInstallRoot().root;
				} catch (err) {
					writeJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
					return;
				}
				relaunch(root, process.argv.slice(2));
				console.log("已触发重启，旧服务即将退出，本窗口可直接关闭");
				writeJson(res, 200, { ok: true });
				setTimeout(() => process.exit(0), 500);
				return;
			}

			if (pathname === "/api/update/rollback" && req.method === "POST") {
				if (agent.streaming) {
					writeJson(res, 409, { error: "任务执行中，请等本轮结束后再回滚" });
					return;
				}
				if (updating) {
					writeJson(res, 409, { error: "已有更新正在进行，请勿重复点击" });
					return;
				}
				let root: string;
				try {
					root = resolveInstallRoot().root;
				} catch (err) {
					writeJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
					return;
				}
				updating = true;
				try {
					await swapRollback(root);
					updating = false;
					pendingRestart = true;
					writeJson(res, 200, { ok: true, needRestart: true });
					return;
				} catch (err) {
					updating = false;
					writeJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
				}
				return;
			}

			if (pathname === "/api/approve" && req.method === "POST") {
				const body = await readBody(req);
				const requestId = typeof body.requestId === "string" ? body.requestId : "";
				const mode = body.mode;
				let value: ApprovalAnswer = true;
				if (mode === "always") {
					const scope = typeof body.scope === "string" ? body.scope : "";
					value = scope && scope.length < 4096 ? { scope } : "always";
				} else if (mode === "deny" || body.approve === false) value = false;
				const resolve = requestId ? pendingApprovals.get(requestId)?.resolve : undefined;
				if (resolve) {
					pendingApprovals.delete(requestId);
					resolve(value);
					writeJson(res, 200, { ok: true });
				} else {
					writeJson(res, 404, { error: `No pending approval: ${requestId}` });
				}
				return;
			}

			if (pathname === "/api/question/answer" && req.method === "POST") {
				const body = await readBody(req);
				const requestId = typeof body.requestId === "string" ? body.requestId : "";
				const choice = typeof body.choice === "string" ? body.choice : "";
				const resolve = requestId ? pendingQuestions.get(requestId)?.resolve : undefined;
				if (resolve) {
					pendingQuestions.delete(requestId);
					resolve(body.mode === "cancel" ? null : choice);
					writeJson(res, 200, { ok: true });
				} else {
					writeJson(res, 404, { error: `No pending question: ${requestId}` });
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
				const body = await readBody(req);
				const title = typeof body.title === "string" ? body.title.trim() : "";
				const resolved = await resolveWorkdirInput(body.cwd);
				if (resolved.error) {
					writeJson(res, 400, { error: resolved.error });
					return;
				}
				const id = makeWorkId();
				const requested = resolved.dir && !sameDir(resolved.dir, activeCwd) ? resolved.dir : null;
				await sessionStore.save({
					id,
					title: title || "未命名工作项",
					cwd: requested ? cwd : (resolved.dir ?? cwd),
					model: agent.state.model,
					messages: [],
					todos: [],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
				if (requested) pendingCwd.set(id, { dir: requested, until: Date.now() + CWD_PENDING_TTL_MS });
				if (agent.streaming) {
					broadcast({ kind: "works" });
					writeJson(res, 200, requested ? { ok: true, id, switched: false, pending: true, cwd: requested } : { ok: true, id, switched: false });
					return;
				}
				await openWork(id);
				writeJson(res, 200, requested ? { ok: true, id, switched: true, pending: true, cwd: requested } : { ok: true, id, switched: true });
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
				const opened = await openWork(id);
				writeJson(res, 200, { ok: true, work: item, providerFallback: opened.providerFallback });
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

			const workCwdMatch = pathname.match(/^\/api\/works\/([^/]+)\/cwd$/);
			if (workCwdMatch && workCwdMatch[1] && req.method === "POST") {
				const id = workCwdMatch[1];
				const body = await readBody(req);
				const raw = typeof body.cwd === "string" ? body.cwd : "";
				if (!raw.trim()) {
					writeJson(res, 400, { error: "需要提供工作目录" });
					return;
				}
				const item = await sessionStore.load(id);
				if (!item) {
					writeJson(res, 404, { error: "Work item not found" });
					return;
				}
				if (body.confirm === true) {
					const now = Date.now();
					for (const [pid, pending] of pendingCwd) {
						if (pending.until <= now) pendingCwd.delete(pid);
					}
					const resolved = await resolveWorkdirInput(raw);
					const problem = checkCwdConfirm(pendingCwd.get(id), resolved.dir ?? null, body.nonce, confirmNonce, now);
					if (problem) {
						writeJson(res, problem.status, { error: problem.error });
						return;
					}
					if (id === currentWorkId && agent.streaming) {
						writeJson(res, 409, { error: "任务执行中，请等本轮结束后再改目录" });
						return;
					}
					pendingCwd.delete(id);
					const dir = resolved.dir;
					if (!dir) {
						writeJson(res, 400, { error: "确认已过期，请重新发起目录变更" });
						return;
					}
					item.cwd = dir;
					await sessionStore.save(item);
					if (id === currentWorkId) await applyCwd(dir);
					writeJson(res, 200, { ok: true, cwd: dir });
					return;
				}
				const resolved = await resolveWorkdirInput(raw);
				if (resolved.error || !resolved.dir) {
					writeJson(res, 400, { error: resolved.error ?? "工作目录无效" });
					return;
				}
				pendingCwd.set(id, { dir: resolved.dir, until: Date.now() + CWD_PENDING_TTL_MS });
				writeJson(res, 202, { pending: true, cwd: resolved.dir });
				return;
			}

			if (pathname === "/api/fs/browse" && req.method === "GET") {
				const start = url.searchParams.get("path") || activeCwd;
				const result = await listChildDirs(start);
				if (result.error || !result.listing) {
					writeJson(res, 400, { error: result.error ?? "目录无效" });
					return;
				}
				writeJson(res, 200, { ok: true, ...result.listing });
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
						await applyCwd(active?.cwd || cwd);
						trackWork(next.id);
					} else {
						const freshId = makeWorkId();
						active = {
							id: freshId,
							title: "未命名工作项",
							cwd: activeCwd,
							model: agent.state.model,
							messages: [],
							todos: [],
							createdAt: Date.now(),
							updatedAt: Date.now(),
						};
						await sessionStore.save(active);
						workTodos.todos = [];
						agent.restore({ messages: [], todos: [] });
						trackWork(freshId);
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
		let retries = 10;
		const onError = (err: unknown): void => {
			if ((err as { code?: string }).code === "EADDRINUSE" && retries > 0 && !server.listening) {
				retries -= 1;
				setTimeout(() => server.listen(port, "127.0.0.1", () => resolve()), 300);
				return;
			}
			if ((err as { code?: string }).code === "EADDRINUSE") {
				console.error(`端口 ${port} 已被占用，服务可能已在运行，无需重复启动，直接用浏览器打开 http://127.0.0.1:${port} 即可`);
				process.exit(1);
			}
			reject(err);
		};
		server.on("error", onError);
		server.listen(port, "127.0.0.1", () => resolve());
	});

	try {
		process.title = `Tju code v${APP_VERSION}`;
	} catch {
		// title is cosmetic only
	}

	const url = `http://127.0.0.1:${port}`;
	console.log(`tju-code GUI: ${url}`);
	console.log(`Model: ${config.api} / ${config.model}`);
	console.log(`Session token: ${token} (required for /api/* requests)`);
	if (pluginNames.length > 0) {
		// Plugin scripts execute in the GUI origin. Loading them is a decision the
		// user should see, not a silent side effect of dropping a folder in place.
		console.log(`Plugins loaded: ${pluginNames.join(", ")} (new plugins need a restart)`);
	}
	console.log("Press Ctrl+C to stop.");

	if (open) {
		await openBrowser(`${url}#t=${token};n=${confirmNonce}`);
	} else {
		console.log(`GUI open URL (contains session secrets, do not share): ${url}#t=${token};n=${confirmNonce}`);
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

const ENTRY_FILE = "pet.js";
const MAX_PLUGIN_FILES = 200;
const PLUGIN_MIME: Record<string, string> = {
	js: "text/javascript; charset=utf-8",
	css: "text/css; charset=utf-8",
	webp: "image/webp",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	ico: "image/x-icon",
	svg: "image/svg+xml",
	json: "application/json; charset=utf-8",
};

function escHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Percent-decoding that never throws: a malformed escape ("%zz") must yield a
 * miss, not an uncaught URIError surfacing as a 500. */
function decodePathSegment(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...SECURITY_HEADERS });
	res.end(JSON.stringify(body));
}

/**
 * Response headers applied to every reply.
 *
 * `script-src 'self'` is the second line of defence: the GUI renders model and
 * tool output through a hand-written markdown renderer, and any escaping mistake
 * there would otherwise become arbitrary script execution in the origin that
 * holds the session token and can drive the agent. No inline event handlers or
 * inline `<style>` blocks are used by the page, so this costs nothing.
 */
const CSP = [
	"default-src 'none'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"connect-src 'self'",
	"font-src 'self'",
	"base-uri 'none'",
	"form-action 'none'",
	"frame-ancestors 'none'",
	"object-src 'none'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
	"content-security-policy": CSP,
	"x-content-type-options": "nosniff",
	"referrer-policy": "no-referrer",
	"x-frame-options": "DENY",
};

/** Recursive file listing of one plugin directory, as paths relative to it. */
async function listPluginFiles(pluginDir: string, rel = "", out: string[] = []): Promise<string[]> {
	if (out.length >= MAX_PLUGIN_FILES) return out;
	let entries;
	try {
		entries = await readdir(join(pluginDir, rel), { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (out.length >= MAX_PLUGIN_FILES) break;
		if (entry.name.startsWith(".")) continue;
		const next = rel ? `${rel}/${entry.name}` : entry.name;
		if (entry.isDirectory()) await listPluginFiles(pluginDir, next, out);
		else if (entry.isFile()) out.push(next);
	}
	return out;
}

const MAX_BODY_BYTES = 1024 * 1024; // bound JSON request bodies
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // single image upload limit (30 MiB)
const MAX_SECRET_CHARS = 8192; // sanity bound on a stored API key
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
