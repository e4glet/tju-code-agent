import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { basename, join } from "node:path";
import type { AgentEvent } from "./types.ts";

/** One persisted AgentEvent line inside a run's JSONL file. */
export interface LogEntry {
	seq: number;
	ts: number;
	runId: string;
	event: AgentEvent;
}

/** Summarized metadata for a recorded run (written as a sidecar file). */
export interface RunMeta {
	runId: string;
	startTs: number;
	endTs: number | null;
	model: string;
	prompt?: string;
	turnCount: number;
	toolCount: number;
	messageCount: number;
}

export interface EventLogOptions {
	dir: string;
	runId: string;
	model: string;
}

const FLUSH_INTERVAL_MS = 200;
const FLUSH_BATCH = 200;

/**
 * Append-only JSONL event log for one run. Events are buffered and written
 * with a write-behind timer (mirroring dsh's session persistence) so hot
 * streams like message_update do not open a file handle per event.
 */
export class EventLog {
	readonly path: string;
	readonly metaPath: string;
	readonly runId: string;
	readonly model: string;

	private readonly dir: string;
	private readonly startTs = Date.now();
	private seq = 0;
	private pending: string[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private flushing: Promise<void> | null = null;
	private finalized = false;
	private turnCount = 0;
	private toolCount = 0;
	private messageCount = 0;
	private prompt = "";
	private endTs: number | null = null;

	constructor(options: EventLogOptions) {
		this.dir = options.dir;
		this.runId = options.runId;
		this.model = options.model;
		this.path = join(options.dir, `${options.runId}.jsonl`);
		this.metaPath = join(options.dir, `${options.runId}.meta.json`);
	}

	static async create(options: EventLogOptions): Promise<EventLog> {
		await mkdir(options.dir, { recursive: true });
		return new EventLog(options);
	}

	append(event: AgentEvent): Promise<void> {
		if (this.finalized) return Promise.resolve();
		this.seq++;
		this.pending.push(JSON.stringify({ seq: this.seq, ts: Date.now(), runId: this.runId, event }) + "\n");
		switch (event.type) {
			case "turn_start":
				this.turnCount++;
				break;
			case "tool_start":
				this.toolCount++;
				break;
			case "message_end":
				this.messageCount++;
				break;
			case "message_start":
				if (!this.prompt && event.message.role === "user" && typeof event.message.content === "string") {
					this.prompt = event.message.content.slice(0, 160);
				}
				break;
		}
		if (!this.flushTimer) {
			this.flushTimer = setTimeout(() => {
				this.flushTimer = null;
				void this.flush();
			}, FLUSH_INTERVAL_MS);
		}
		if (this.pending.length >= FLUSH_BATCH) return this.flush();
		return Promise.resolve();
	}

	async flush(): Promise<void> {
		if (this.flushing) return this.flushing;
		if (!this.pending.length) return;
		const lines = this.pending.splice(0);
		this.flushing = appendFile(this.path, lines.join(""), "utf-8").finally(() => {
			this.flushing = null;
		});
		return this.flushing;
	}

	async finalize(): Promise<RunMeta> {
		if (this.finalized) return this.meta();
		this.finalized = true;
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		this.endTs = Date.now();
		await this.flush();
		const meta = this.meta();
		await writeFile(this.metaPath, JSON.stringify(meta), "utf-8");
		return meta;
	}

	private meta(): RunMeta {
		return {
			runId: this.runId,
			startTs: this.startTs,
			endTs: this.endTs,
			model: this.model,
			prompt: this.prompt || undefined,
			turnCount: this.turnCount,
			toolCount: this.toolCount,
			messageCount: this.messageCount,
		};
	}
}

/**
 * Stream every persisted event for a run, in order, without loading the whole
 * file into memory. Unreadable or missing run files stream nothing (best
 * effort), matching the previous `readRunEvents` behavior.
 */
export async function* readRunEventsStream(dir: string, runId: string): AsyncGenerator<LogEntry> {
	const rl = createInterface({
		input: createReadStream(join(dir, `${runId}.jsonl`), { encoding: "utf-8" }),
		crlfDelay: Infinity,
	});
	try {
		for await (const line of rl) {
			if (!line) continue;
			try {
				const entry = JSON.parse(line) as LogEntry;
				if (entry && typeof entry.event === "object") yield entry;
			} catch {
				// skip malformed lines
			}
		}
	} catch {
		// unreadable / missing run file -> stream nothing
	} finally {
		rl.close();
	}
}

/** Read every persisted event for a run, in order. */
export async function readRunEvents(dir: string, runId: string): Promise<LogEntry[]> {
	const entries: LogEntry[] = [];
	for await (const entry of readRunEventsStream(dir, runId)) entries.push(entry);
	return entries;
}

export async function readRunMeta(dir: string, runId: string): Promise<RunMeta | null> {
	try {
		const raw = await readFile(join(dir, `${runId}.meta.json`), "utf-8");
		const meta = JSON.parse(raw) as RunMeta;
		return meta && typeof meta.runId === "string" ? meta : null;
	} catch {
		return null;
	}
}

function deriveMeta(runId: string, entries: LogEntry[]): RunMeta {
	let startTs = 0;
	let turnCount = 0;
	let toolCount = 0;
	let messageCount = 0;
	let prompt = "";
	for (const entry of entries) {
		if (!startTs) startTs = entry.ts;
		const event = entry.event;
		switch (event.type) {
			case "turn_start":
				turnCount++;
				break;
			case "tool_start":
				toolCount++;
				break;
			case "message_end":
				messageCount++;
				break;
			case "message_start":
				if (!prompt && event.message.role === "user" && typeof event.message.content === "string") {
					prompt = event.message.content.slice(0, 160);
				}
				break;
		}
	}
	return {
		runId,
		startTs: startTs || Date.now(),
		endTs: null,
		model: "",
		prompt: prompt || undefined,
		turnCount,
		toolCount,
		messageCount,
	};
}

/** A compact timeline segment for one record in a run, used for mini overview bars. */
export interface RunSegment {
	k: "u" | "m" | "t";
	off: number;
	dur: number;
	st?: "ok" | "err";
}

/** Accumulates timeline segments while folding events, keeping only open state in memory. */
class SegmentAccumulator {
	private base: number | null = null;
	private lastTs = 0;
	private readonly toolOpen = new Map<string, { off: number; ts: number }>();
	private readonly msgOpen: Array<{ role: "user" | "assistant"; off: number; ts: number }> = [];
	private readonly segs: RunSegment[] = [];

	push(entry: LogEntry): void {
		if (this.base === null) this.base = entry.ts;
		if (entry.ts > this.lastTs) this.lastTs = entry.ts;
		const base = this.base;
		const event = entry.event;
		switch (event.type) {
			case "message_start": {
				const role = event.message.role === "user" ? "user" : "assistant";
				this.msgOpen.push({ role, off: entry.ts - base, ts: entry.ts });
				break;
			}
			case "message_end": {
				const role = event.message.role === "user" ? "user" : "assistant";
				const idx = this.msgOpen.findIndex((m) => m.role === role);
				if (idx >= 0) {
					const open = this.msgOpen.splice(idx, 1)[0]!;
					this.segs.push({ k: role === "user" ? "u" : "m", off: open.off, dur: Math.max(0, entry.ts - open.ts) });
				}
				break;
			}
			case "tool_start": {
				this.toolOpen.set(event.toolCallId, { off: entry.ts - base, ts: entry.ts });
				break;
			}
			case "tool_end": {
				const open = this.toolOpen.get(event.toolCallId);
				if (open) {
					this.toolOpen.delete(event.toolCallId);
					this.segs.push({ k: "t", off: open.off, dur: Math.max(0, entry.ts - open.ts), st: event.isError ? "err" : "ok" });
				}
				break;
			}
			default:
				break;
		}
	}

	finish(): RunSegment[] {
		if (this.base === null) return [];
		for (const [, open] of this.toolOpen) {
			this.segs.push({ k: "t", off: open.off, dur: Math.max(0, this.lastTs - open.ts) });
		}
		for (const open of this.msgOpen) {
			this.segs.push({ k: open.role === "user" ? "u" : "m", off: open.off, dur: Math.max(0, this.lastTs - open.ts) });
		}
		this.segs.sort((a, b) => a.off - b.off);
		return this.segs;
	}
}

/** Derive compact timeline segments from persisted events, offset from run start. */
export function deriveSegments(entries: LogEntry[]): RunSegment[] {
	const acc = new SegmentAccumulator();
	for (const entry of entries) acc.push(entry);
	return acc.finish();
}

/** Like {@link deriveSegments}, but folds directly off the JSONL stream (memory-friendly for large runs). */
export async function deriveSegmentsStream(dir: string, runId: string): Promise<RunSegment[]> {
	const acc = new SegmentAccumulator();
	for await (const entry of readRunEventsStream(dir, runId)) acc.push(entry);
	return acc.finish();
}

/** A recorded run plus the timeline and on-disk size the GUI needs to render it. */
export interface RunSummary extends RunMeta {
	segments: RunSegment[];
	bytes: number;
}

/** List recorded runs newest first, each annotated with compact timeline segments. */
export async function summarizeRuns(dir: string): Promise<RunSummary[]> {
	const metas = await listRuns(dir);
	const out: RunSummary[] = [];
	for (const meta of metas) {
		out.push({ ...meta, segments: await deriveSegmentsStream(dir, meta.runId), bytes: await runBytes(dir, meta.runId) });
	}
	return out;
}

/** List recorded runs newest first, preferring sidecar metadata. */
export async function listRuns(dir: string): Promise<RunMeta[]> {
	const names = await readdir(dir).catch(() => []);
	const runIds = new Set<string>();
	for (const name of names) {
		if (name.endsWith(".jsonl")) runIds.add(name.slice(0, -".jsonl".length));
		else if (name.endsWith(".meta.json")) runIds.add(name.slice(0, -".meta.json".length));
	}
	const metas: RunMeta[] = [];
	for (const runId of runIds) {
		const meta = await readRunMeta(dir, runId);
		if (meta) {
			metas.push(meta);
			continue;
		}
		const entries = await readRunEvents(dir, runId);
		if (entries.length) metas.push(deriveMeta(runId, entries));
	}
	metas.sort((a, b) => b.startTs - a.startTs);
	return metas;
}

/**
 * A run id must be a flat, single-segment name: the delete helpers below build
 * paths from it, so a separator or `..` could escape the log directory.
 */
export function isSafeRunId(runId: string): boolean {
	if (typeof runId !== "string" || !runId || runId.length > 128) return false;
	if (runId.includes("/") || runId.includes("\\") || runId.includes("\0")) return false;
	if (runId.includes("..")) return false;
	return runId === basename(runId);
}

/** Files that make up one recorded run. */
function runFileNames(runId: string): string[] {
	return [`${runId}.jsonl`, `${runId}.meta.json`];
}

/** Delete a run's jsonl + meta files. Returns true if anything was removed. Unsafe ids are a no-op. */
async function removeRunFiles(dir: string, runId: string): Promise<boolean> {
	if (!isSafeRunId(runId)) return false;
	let removed = false;
	for (const name of runFileNames(runId)) {
		const file = join(dir, name);
		try {
			await stat(file);
		} catch {
			continue;
		}
		await rm(file, { force: true });
		removed = true;
	}
	return removed;
}

/** Delete a run's jsonl + meta sidecar files if present. Returns true if anything was removed. */
export async function removeRun(dir: string, runId: string): Promise<boolean> {
	return removeRunFiles(dir, runId);
}

/** Why one requested run was left on disk by {@link removeRuns}. */
export interface SkippedRun {
	runId: string;
	reason: string;
}

export interface RemoveRunsResult {
	/** Run ids whose files were actually deleted. */
	deleted: string[];
	/** Run ids that were left alone, with a machine-readable reason. */
	skipped: SkippedRun[];
}

export interface RemoveRunsOptions {
	/**
	 * Run ids that must never be deleted (e.g. the run currently being written).
	 * These are reported as `skipped` with reason `"active"` rather than failing
	 * the whole batch.
	 */
	exclude?: Iterable<string>;
}

/** How many runs are unlinked at once. Bounds fs pressure on large batches. */
const REMOVE_CONCURRENCY = 8;

/**
 * Delete many runs in one call.
 *
 * Partial failure is expected and reported per run: callers must act only on
 * `deleted`. The call is idempotent — unknown ids become `skipped: "missing"`,
 * not errors.
 */
export async function removeRuns(
	dir: string,
	runIds: Iterable<string>,
	options: RemoveRunsOptions = {},
): Promise<RemoveRunsResult> {
	const exclude = new Set(options.exclude ?? []);
	const queue = [...new Set(runIds)];
	const deleted: string[] = [];
	const skipped: SkippedRun[] = [];
	const worker = async (): Promise<void> => {
		for (;;) {
			const runId = queue.shift();
			if (runId === undefined) return;
			if (!isSafeRunId(runId)) {
				skipped.push({ runId: String(runId), reason: "invalid-id" });
				continue;
			}
			if (exclude.has(runId)) {
				skipped.push({ runId, reason: "active" });
				continue;
			}
			try {
				if (await removeRunFiles(dir, runId)) deleted.push(runId);
				else skipped.push({ runId, reason: "missing" });
			} catch (error) {
				skipped.push({ runId, reason: error instanceof Error ? error.message : String(error) });
			}
		}
	};
	const workers = Math.max(1, Math.min(REMOVE_CONCURRENCY, queue.length));
	await Promise.all(Array.from({ length: workers }, worker));
	return { deleted, skipped };
}

/** Total on-disk size (jsonl + meta) of one run. 0 for missing or unsafe ids. */
export async function runBytes(dir: string, runId: string): Promise<number> {
	if (!isSafeRunId(runId)) return 0;
	let total = 0;
	for (const name of runFileNames(runId)) {
		const st = await stat(join(dir, name)).catch(() => null);
		if (st) total += st.size;
	}
	return total;
}
/**
 * Delete runs (jsonl + meta) last modified before the retention window.
 *
 * Pass `exclude` with any run id that is still being written: retention must
 * never race an in-flight run's append (see `EventLog`).
 */
export async function cleanupRuns(
	dir: string,
	retentionDays: number,
	options: RemoveRunsOptions = {},
): Promise<void> {
	if (retentionDays <= 0) return;
	const cutoff = Date.now() - retentionDays * 86_400_000;
	const exclude = new Set(options.exclude ?? []);
	const names = await readdir(dir).catch(() => []);
	const byRun = new Map<string, string[]>();
	for (const name of names) {
		if (!name.endsWith(".jsonl") && !name.endsWith(".meta.json")) continue;
		const runId = name.endsWith(".jsonl") ? name.slice(0, -".jsonl".length) : name.slice(0, -".meta.json".length);
		if (exclude.has(runId)) continue;
		const list = byRun.get(runId) ?? [];
		list.push(name);
		byRun.set(runId, list);
	}
	for (const [, files] of byRun) {
		// Age a run by its newest file, not an arbitrary one: a run whose jsonl was
		// just appended to must not look expired because its meta sidecar is older.
		let newest = 0;
		for (const file of files) {
			const st = await stat(join(dir, file)).catch(() => null);
			if (st && st.mtimeMs > newest) newest = st.mtimeMs;
		}
		if (!newest || newest >= cutoff) continue;
		for (const file of files) {
			await rm(join(dir, file), { force: true });
		}
	}
}