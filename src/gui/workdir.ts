import { constants, existsSync } from "node:fs";
import { access, open, readdir, realpath, stat, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, join, normalize } from "node:path";

export interface ResolvedWorkdir {
	dir?: string;
	error?: string;
}

export interface CwdPending {
	dir: string;
	until: number;
}

export function checkCwdConfirm(
	pending: CwdPending | undefined,
	dir: string | null,
	nonce: unknown,
	expectedNonce: string,
	now: number,
): { status: number; error: string } | null {
	if (nonce !== expectedNonce) {
		return { status: 403, error: "确认凭证无效，请在最初打开的页面标签中操作，或从服务端控制台的 open URL 重新打开" };
	}
	if (!pending || !dir || pending.dir !== dir || pending.until <= now) {
		return { status: 400, error: "确认已过期，请重新发起目录变更" };
	}
	return null;
}

export async function resolveWorkdirInput(input: unknown, requireWritable = true): Promise<ResolvedWorkdir> {
	if (input === undefined || input === null) return {};
	if (typeof input !== "string") return { error: "工作目录必须是绝对路径字符串" };
	const trimmed = input.trim();
	if (!trimmed) return {};
	if (!isAbsolute(trimmed)) return { error: "工作目录必须是绝对路径" };
	const normalized = normalize(trimmed);
	let info;
	try {
		info = await stat(normalized);
	} catch {
		return { error: `目录不存在：${trimmed}` };
	}
	if (!info.isDirectory()) return { error: `不是目录：${trimmed}` };
	try {
		await access(normalized, constants.R_OK);
	} catch {
		return { error: `目录不可读：${trimmed}` };
	}
	if (requireWritable) {
		const probe = join(normalized, `.tju-write-test-${process.pid}-${randomBytes(4).toString("hex")}.tmp`);
		try {
			const handle = await open(probe, "wx", 0o600);
			await handle.close();
			await unlink(probe);
		} catch {
			return { error: `目录不可读写：${trimmed}` };
		}
	}
	try {
		return { dir: await realpath(normalized) };
	} catch {
		return { dir: normalized };
	}
}

export interface DirEntry {
	name: string;
	path: string;
}

export interface DirListing {
	path: string;
	parent: string | null;
	entries: DirEntry[];
	truncated: boolean;
	drives: string[];
}

export function listDrives(): string[] {
	if (process.platform !== "win32") return ["/"];
	const drives: string[] = [];
	for (let code = 65; code <= 90; code++) {
		const root = `${String.fromCharCode(code)}:\\`;
		try {
			if (existsSync(root)) drives.push(root);
		} catch {
			continue;
		}
	}
	return drives;
}

const MAX_BROWSE_ENTRIES = 500;

export async function listChildDirs(input: string): Promise<{ listing?: DirListing; error?: string }> {
	const resolved = await resolveWorkdirInput(input, false);
	if (resolved.error || !resolved.dir) return { error: resolved.error ?? "需要提供目录" };
	const dir = resolved.dir;
	let dirents;
	try {
		dirents = await readdir(dir, { withFileTypes: true });
	} catch {
		return { error: `目录不可读：${dir}` };
	}
	const entries: DirEntry[] = [];
	let truncated = false;
	for (const entry of dirents) {
		if (!entry.isDirectory()) continue;
		if (entries.length >= MAX_BROWSE_ENTRIES) {
			truncated = true;
			break;
		}
		entries.push({ name: entry.name, path: join(dir, entry.name) });
	}
	entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	const parent = dirname(dir);
	return { listing: { path: dir, parent: parent === dir ? null : parent, entries, truncated, drives: listDrives() } };
}
