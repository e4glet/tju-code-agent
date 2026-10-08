import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { BeforeToolCall, BeforeToolCallContext, BeforeToolCallResult } from "./types.ts";

export interface ApprovalRequest {
	/** Unique id (the originating tool call id) so a UI can answer back. */
	requestId: string;
	toolName: string;
	path: string;
	scopeDir: string;
	parentDir: string | null;
}

export type ApprovalAnswer = boolean | "always" | { scope: string };

export interface ApprovalGateOptions {
	workdir: string;
	/** true allows once, "always" remembers the directory for the session, false blocks. */
	ask: (request: ApprovalRequest, signal?: AbortSignal) => ApprovalAnswer | Promise<ApprovalAnswer>;
}

// Argument keys that always denote a filesystem path. Any tool whose arguments
// carry one of these (at any nesting depth) is checked, so a tool added later is
// covered without maintaining a tool allowlist — maintaining one is exactly how
// `apply_patch` (operations[].path) and `scan` (path) silently escaped this gate.
const PATH_ARG_KEYS = new Set([
	"path",
	"file",
	"filepath",
	"file_path",
	"dir",
	"directory",
	"cwd",
	"target",
	"dest",
	"destination",
	"root",
]);

// `bash` has no path argument, so its paths have to be read out of the command
// string: a heuristic, and therefore a best-effort guard rather than a sandbox.
// See the security notes in README ("审批门的边界").
const MAX_ARG_DEPTH = 4;
const MAX_DIRS_PER_CALL = 8;

// A drive path must be a standalone token: the drive letter cannot be glued to
// a preceding word char, otherwise protocol strings like `redis://` or
// `https://` would be misread as `s:\` / `p:\` drive paths. Trailing command
// separators/punctuation (`; , ( ) & [ ]` etc.) are excluded so `D:\dir;` does
// not produce a bogus `D:\dir;` scope.
const WIN_PATH = /\b[A-Za-z]:[\\/][^\s"'<>|*?&;,()\[\]`]+/g;
const UNIX_PATH = /\/[^\s"'<>]+/g;
const URL_HOST = /https?:\/\/([^\/\s"'<>|*?&;,()`]+)/gi;
const BARE_HOST = /(?:^|[\s"'`(=])((?:127(?:\.\d{1,3}){3}|localhost)(?::\d+)?)(\/)?/gi;

export function isLoopbackHost(hostport: string): boolean {
	let host = hostport.trim().toLowerCase();
	if (host.startsWith("[")) {
		const end = host.indexOf("]");
		if (end < 0) return false;
		host = host.slice(1, end);
	} else {
		const first = host.indexOf(":");
		const last = host.lastIndexOf(":");
		if (first >= 0 && first === last) host = host.slice(0, first);
	}
	if (host.endsWith(".")) host = host.slice(0, -1);
	if (host === "localhost" || host === "::1" || host === "0.0.0.0") return true;
	if (host.endsWith(".localhost")) return true;
	if (/^(?:0[xX][0-9a-fA-F]+|\d+)$/.test(host)) {
		const uint = host.toLowerCase().startsWith("0x") ? parseInt(host, 16) : Number(host);
		if (!Number.isInteger(uint) || uint < 0 || uint > 0xffffffff) return false;
		return uint >>> 24 === 127;
	}
	const parts = host.split(".");
	if (parts.length !== 4) return false;
	const nums: number[] = [];
	for (const p of parts) {
		let n: number;
		if (/^0[xX][0-9a-fA-F]{1,2}$/.test(p)) n = parseInt(p, 16);
		else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
		else if (/^\d{1,3}$/.test(p)) n = Number(p);
		else return false;
		if (!(n >= 0 && n <= 255)) return false;
		nums.push(n);
	}
	return nums[0] === 127;
}

// `%VAR%`, `${VAR}` and `$VAR`, so a path assembled through the environment is
// still visible to the gate: `type %USERPROFILE%\.ssh\id_rsa` used to expand to
// a real path only inside the shell, after the gate had already passed it.
const ENV_REF = /%([A-Za-z_][A-Za-z0-9_]*)%|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

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

/** A drive/filesystem root, whose "remember this directory" grant would cover
 * the entire volume — too coarse to persist, so it is only ever allowed once. */
function isFilesystemRoot(dir: string): boolean {
	return dirname(dir) === dir;
}

function parentOf(dir: string): string | null {
	const parent = dirname(dir);
	return isFilesystemRoot(parent) ? null : parent;
}

async function toDir(p: string): Promise<string> {
	const t = normalizePath(p);
	const last = t.split(/[\\/]/).pop() ?? "";
	const looksLikeFile = last.includes(".") && !/^\.+$/.test(last);
	return canonicalize(resolve(looksLikeFile ? dirname(t) : t));
}

/** Every path-looking argument, at any nesting depth (covers `operations[].path`). */
function collectPathArgs(value: unknown, depth = 0, out: string[] = []): string[] {
	if (depth > MAX_ARG_DEPTH || !value || typeof value !== "object") return out;
	if (Array.isArray(value)) {
		for (const item of value) collectPathArgs(item, depth + 1, out);
		return out;
	}
	for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
		if (typeof val === "string") {
			if (PATH_ARG_KEYS.has(key.toLowerCase()) && val.trim()) out.push(val);
		} else if (val && typeof val === "object") {
			collectPathArgs(val, depth + 1, out);
		}
	}
	return out;
}

/** Substitute `$VAR` / `%VAR%` from the environment so shell-level indirection
 * does not hide the real path. List-like values (PATH, PATHEXT, ...) are left
 * alone: expanding them would flood the user with one prompt per entry. */
function expandEnvRefs(command: string): string {
	return command.replace(ENV_REF, (whole, winVar, braced, plain) => {
		const name = String(winVar ?? braced ?? plain);
		const value = process.env[name];
		if (value === undefined || value === "") return whole;
		if (value.includes(";")) return whole;
		if ((value.match(/:/g) ?? []).length > 1) return whole;
		return value;
	});
}

interface CandidateDir {
	dir: string;
	label: string;
	isUrl: boolean;
}

async function candidateDirs(workdir: string, toolName: string, args: unknown): Promise<CandidateDir[]> {
	const raw = args as Record<string, unknown>;
	const found: CandidateDir[] = [];
	const seen = new Set<string>();
	const push = async (p: string): Promise<void> => {
		if (found.length >= MAX_DIRS_PER_CALL) return;
		const dir = await toDir(p);
		if (!dir || seen.has(dir)) return;
		seen.add(dir);
		found.push({ dir, label: dir, isUrl: false });
	};
	const pushUrl = (u: string): void => {
		if (found.length >= MAX_DIRS_PER_CALL) return;
		if (!u || seen.has(u)) return;
		seen.add(u);
		found.push({ dir: u, label: u, isUrl: true });
	};

	if (toolName === "bash") {
		const command = typeof raw.command === "string" ? raw.command : "";
		const expanded = expandEnvRefs(command);
		const pattern = process.platform === "win32" ? WIN_PATH : UNIX_PATH;
		for (const m of expanded.matchAll(pattern)) {
			const pathValue = normalizePath(m[0]);
			if (pathValue) await push(pathValue);
		}
		for (const m of expanded.matchAll(URL_HOST)) {
			if (m[1] && isLoopbackHost(m[1])) pushUrl(m[0]);
		}
		for (const m of expanded.matchAll(BARE_HOST)) {
			if (m[1] && isLoopbackHost(m[1]) && (m[1].includes(":") || m[2])) pushUrl(m[1]);
		}
		if (typeof raw.workdir === "string" && raw.workdir.trim()) {
			const wd = raw.workdir.trim();
			await push(isAbsolute(wd) ? wd : resolve(workdir, wd));
		}
		return found;
	}

	for (const pathValue of collectPathArgs(args)) {
		const trimmed = pathValue.trim();
		// Resolve relative paths against the agent workdir so the approval gate
		// checks the same directory the tool will actually touch.
		await push(isAbsolute(trimmed) ? trimmed : resolve(workdir, trimmed));
	}
	return found;
}

export function createApprovalGate(
	options: ApprovalGateOptions,
): NonNullable<BeforeToolCall> {
	const workdir = resolve(options.workdir);
	// Canonical workdir is resolved once and reused: `createApprovalGate` is
	// called before the first tool runs, so the first gate invocation awaits it.
	let workdirCanonical: Promise<string> | null = null;
	const getWorkdir = (): Promise<string> => (workdirCanonical ??= canonicalize(workdir));

	// Stored in canonical form, so membership checks are plain prefix compares.
	const approvedDirs: string[] = [];
	const alreadyApproved = (dir: string): boolean =>
		approvedDirs.some((a) => contains(a, dir));

	return async (context, signal) => {
		const wd = await getWorkdir();
		for (const cand of await candidateDirs(workdir, context.toolCall.name, context.args)) {
			if (alreadyApproved(cand.dir)) continue;
			if (!cand.isUrl && contains(wd, cand.dir)) continue;
			const ok = await options.ask(
				{
					requestId: context.toolCall.id,
					toolName: context.toolCall.name,
					path: cand.dir,
					scopeDir: cand.label,
					parentDir: cand.isUrl ? null : parentOf(cand.dir),
				},
				signal,
			);
			if (typeof ok === "object" && ok !== null) {
				const scope = await canonicalize(resolve(ok.scope));
				if (scope && contains(scope, cand.dir) && !isFilesystemRoot(scope)) {
					if (!alreadyApproved(scope)) approvedDirs.push(scope);
				} else {
					return { block: true, reason: `用户未授权访问目录: ${cand.dir}` };
				}
			} else if (ok === "always") {
				// "always" on a volume root would hand over the whole drive, so a
				// root is granted for this call only and asked again next time.
				if (!isFilesystemRoot(cand.dir)) approvedDirs.push(cand.dir);
			} else if (ok !== true) {
				return { block: true, reason: `用户未授权访问目录: ${cand.dir}` };
			}
		}
		return undefined;
	};
}
