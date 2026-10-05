import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { BeforeToolCallContext, BeforeToolCallResult } from "./types.ts";

export interface ApprovalRequest {
	/** Unique id (the originating tool call id) so a UI can answer back. */
	requestId: string;
	toolName: string;
	path: string;
	scopeDir: string;
}

export interface ApprovalGateOptions {
	workdir: string;
	/** true allows once, "always" remembers the directory for the session, false blocks. */
	ask: (request: ApprovalRequest) => boolean | "always" | Promise<boolean | "always">;
}

const FILE_TOOLS = new Set(["read", "write", "edit", "grep", "glob"]);

// A drive path must be a standalone token: the drive letter cannot be glued to
// a preceding word char, otherwise protocol strings like `redis://` or
// `https://` would be misread as `s:\` / `p:\` drive paths. Trailing command
// separators/punctuation (`; , ( ) & [ ]` etc.) are excluded so `D:\dir;` does
// not produce a bogus `D:\dir;` scope.
const WIN_PATH = /\b[A-Za-z]:[\\/][^\s"'<>|*?&;,()\[\]`]+/g;
const UNIX_PATH = /\/[^\s"'<>]+/g;

function normalizePath(p: string): string {
	if (typeof p !== "string" || !p.trim()) return "";
	const t = p.trim().replace(/^"|"$/g, "").replace(/\//g, "\\");
	return t;
}

/**
 * Resolve a path to its canonical absolute form, following every symlink on
 * the way. This is the security-critical step: `resolve()` only normalizes the
 * string form, so a symlink inside the workdir that points elsewhere would
 * still look "inside" the workdir and skip the approval prompt (the same class
 * of bug as Claude Code CVE-2025-59829 / CVE-2026-25724). `realpath()` walks
 * the filesystem and returns the physical target.
 *
 * `realpath()` throws for a path that does not exist yet (e.g. a `write` target
 * whose parent dirs are still missing). In that case the deepest existing
 * ancestor is canonicalized and the not-yet-created segments are re-appended
 * verbatim, so symlinked ancestors are still resolved.
 */
async function canonicalize(p: string): Promise<string> {
	const abs = resolve(p);
	try {
		return await realpath(abs);
	} catch {
		const missing: string[] = [];
		let cur = abs;
		for (;;) {
			const parent = dirname(cur);
			if (parent === cur) return abs; // reached the filesystem root
			missing.unshift(basename(cur));
			try {
				const real = await realpath(parent);
				return join(real, ...missing);
			} catch {
				cur = parent;
			}
		}
	}
}

/** Prefix check on two already-canonical paths. */
function contains(base: string, target: string): boolean {
	let b = base.replace(/[\\/]+$/, "");
	let t = target;
	if (process.platform === "win32") {
		b = b.toLowerCase();
		t = t.toLowerCase();
	}
	const sep = process.platform === "win32" ? "\\" : "/";
	if (t.length < b.length) return false;
	return t === b || t.startsWith(b + sep);
}

/** Async, symlink-aware variant of the old `isInside`. */
async function isInside(base: string, target: string): Promise<boolean> {
	return contains(await canonicalize(base), await canonicalize(target));
}

async function toDir(p: string): Promise<string> {
	const t = normalizePath(p);
	const last = t.split(/[\\/]/).pop() ?? "";
	const looksLikeFile = last.includes(".") && !/^\.+$/.test(last);
	return canonicalize(resolve(looksLikeFile ? dirname(t) : t));
}

async function candidateDirs(workdir: string, toolName: string, args: unknown): Promise<string[]> {
	const raw = args as Record<string, unknown>;
	if (FILE_TOOLS.has(toolName)) {
		const pathValue = typeof raw.path === "string" ? raw.path : "";
		if (!pathValue.trim()) return [];
		const trimmed = pathValue.trim();
		// Resolve relative paths against the agent workdir so the approval gate
		// checks the same directory the tool will actually touch.
		const full = isAbsolute(trimmed) ? trimmed : resolve(workdir, trimmed);
		return [await toDir(full)];
	}
	if (toolName === "bash") {
		const command = typeof raw.command === "string" ? raw.command : "";
		const pattern = process.platform === "win32" ? WIN_PATH : UNIX_PATH;
		const found: string[] = [];
		for (const m of command.matchAll(pattern)) {
			const pathValue = normalizePath(m[0]);
			if (pathValue) found.push(await toDir(pathValue));
		}
		return found;
	}
	return [];
}

export function createApprovalGate(
	options: ApprovalGateOptions,
): (context: BeforeToolCallContext) => Promise<BeforeToolCallResult | undefined> {
	const workdir = resolve(options.workdir);
	// Canonical workdir is resolved once and reused: `createApprovalGate` is
	// called before the first tool runs, so the first gate invocation awaits it.
	let workdirCanonical: Promise<string> | null = null;
	const getWorkdir = (): Promise<string> => (workdirCanonical ??= canonicalize(workdir));

	// Stored in canonical form, so membership checks are plain prefix compares.
	const approvedDirs: string[] = [];
	const alreadyApproved = (dir: string): boolean =>
		approvedDirs.some((a) => contains(a, dir));

	return async (context) => {
		const wd = await getWorkdir();
		for (const dir of await candidateDirs(workdir, context.toolCall.name, context.args)) {
			if (contains(wd, dir) || alreadyApproved(dir)) continue;
			// `dir` is the physical target, not the string the model passed, so
			// the prompt shows the user the real location being granted.
			const ok = await options.ask({
				requestId: context.toolCall.id,
				toolName: context.toolCall.name,
				path: dir,
				scopeDir: dir,
			});
			if (ok === "always") {
				approvedDirs.push(dir);
			} else if (ok !== true) {
				return { block: true, reason: `用户未授权访问目录: ${dir}` };
			}
		}
		return undefined;
	};
}