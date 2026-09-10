import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Message, Model, Todo } from "./types.ts";

/** A persisted conversation-level container holding one work item's full state. */
export interface WorkItem {
	id: string;
	title: string;
	cwd: string;
	model: Model;
	messages: Message[];
	todos: Todo[];
	createdAt: number;
	updatedAt: number;
}

export interface SessionStoreOptions {
	dir: string;
}

const WORK_ITEM_FILE = "work-item.json";
const LAST_ACTIVE_FILE = ".last-active.json";

function readJson<T>(path: string): Promise<T | null> {
	return readFile(path, "utf-8")
		.then((raw) => JSON.parse(raw) as T)
		.catch(() => null);
}

/**
 * Persistent multi-work-item session store.
 *
 * Each work item lives in its own directory under the store root, written
 * atomically (temp file + rename). The store is not aware of run logs, so
 * deletion only removes the conversation container; run traces stay global.
 */
export class SessionStore {
	readonly dir: string;

	constructor(options: SessionStoreOptions) {
		this.dir = options.dir;
	}

	/** Absolute path of the directory that stores one work item. */
	itemDir(id: string): string {
		return join(this.dir, id);
	}

	async list(): Promise<WorkItem[]> {
		const names = await readdir(this.dir).catch(() => []);
		const items: WorkItem[] = [];
		for (const name of names) {
			if (name.startsWith(".")) continue;
			const item = await this.load(name);
			if (item) items.push(item);
		}
		items.sort((a, b) => b.updatedAt - a.updatedAt);
		return items;
	}

	async load(id: string): Promise<WorkItem | null> {
		if (!id || id !== basename(id) || id.startsWith(".")) return null;
		const item = await readJson<WorkItem>(join(this.itemDir(id), WORK_ITEM_FILE));
		if (!item || typeof item.id !== "string" || typeof item.title !== "string") return null;
		return item;
	}

	async save(item: WorkItem): Promise<void> {
		const dir = this.itemDir(item.id);
		await mkdir(dir, { recursive: true });
		const target = join(dir, WORK_ITEM_FILE);
		const tmp = `${target}.${process.pid}.tmp`;
		// Respect the caller-provided updatedAt: bumping it is the caller's
		// decision (e.g. only on actual use), not an automatic side effect of
		// every write.
		await writeFile(tmp, JSON.stringify(item), "utf-8");
		await rename(tmp, target);
	}

	async remove(id: string): Promise<boolean> {
		if (!id || id !== basename(id) || id.startsWith(".")) return false;
		try {
			await rm(this.itemDir(id), { recursive: true, force: true });
			return true;
		} catch {
			return false;
		}
	}

	/** Persist which work item was last used, so it can be re-selected on restart. */
	async setLastActive(id: string | null): Promise<void> {
		const target = join(this.dir, LAST_ACTIVE_FILE);
		if (!id) {
			await rm(target, { force: true }).catch(() => {});
			return;
		}
		await mkdir(this.dir, { recursive: true });
		const tmp = `${target}.${process.pid}.tmp`;
		await writeFile(tmp, JSON.stringify({ id }), "utf-8");
		await rename(tmp, target);
	}

	/** The last used work item id, if any. */
	async getLastActive(): Promise<string | null> {
		const data = await readJson<{ id?: unknown }>(join(this.dir, LAST_ACTIVE_FILE));
		return data && typeof data.id === "string" ? data.id : null;
	}
}
