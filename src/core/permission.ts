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
	/** Which part of the request produced this path (e.g. `命令中的 cd 目标 "cd /d D:\\x"`).
	 * Shown in the prompt so a directory the user does not recognise is traceable to
	 * the exact command fragment that asked for it. Optional for backward compat. */
	via?: string;
	/** Canonical work directory in force when the request was made. */
	workdir?: string;
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
// The tail is `*` — not `+` — so the bare volume root `D:\` is a candidate too:
// `dir /s /b D:\` walks the whole drive, and with `+` it produced no candidate at
// all (no approval, no trace).
const WIN_PATH = /\b[A-Za-z]:[\\/][^\s"'<>|*?&;,()\[\]`]*/g;
// A bare `<drive>:` with no separator means "the current directory on that
// drive", whose value the gate cannot see. Read as the drive root: conservative,
// and a root grant is only ever allowed once. The leading delimiter keeps
// protocol/host-port forms (`https://`, `localhost:9399`) out.
const DRIVE_ONLY = /(?:^|[\s"'`(=;&|])([A-Za-z]:)(?![\\/])/g;
const UNIX_PATH = /\/[^\s"'<>]+/g;
const URL_HOST = /https?:\/\/([^\/\s"'<>|*?&;,()`]+)/gi;
const BARE_HOST = /(?:^|[\s"'`(=])((?:127(?:\.\d{1,3}){3}|localhost)(?::\d+)?)(\/)?/gi;
const CD_TARGET = /\bcd\s+(?:\/d\s+)?(?:"([^"]+)"|'([^']+)'|(\S+))/gi;
const DOT_FRAGMENT = /(?:^|[\s"'`(=;&|()])(\.{1,2}[\\/][^\s"'<>|*?&;,()\[\]`]*)/g;

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
export async function canonicalize(p: string): Promise<string> {
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
export function contains(base: string, target: string): boolean {
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

/** Collapse a command fragment to a short single-line quote for prompts. */
function snippet(s: string, max = 96): string {
	const one = s.replace(/\s+/g, " ").trim();
	return one.length > max ? `${one.slice(0, max)}…` : one;
}

/** Does this path exist and point at a directory? Used instead of guessing from
 * the name, so dotted directories (`.tju-code`, `node_modules/.bin`) are not
 * mistaken for files: mistaking one made the gate ask for — and remember — its
 * *parent* directory instead of the directory the command really touched. */
async function isDirExists(p: string): Promise<boolean> {
	try {
		const { stat } = await import("node:fs/promises");
		return (await stat(p)).isDirectory();
	} catch {
		return false;
	}
}

async function toDir(p: string): Promise<string> {
	const t = normalizePath(p);
	// Existing paths are classified by the filesystem. Only paths that do not exist
	// (or contain globs) fall back to the old name heuristic.
	if (t && !/[*?]/.test(t) && (await isDirExists(resolve(t)))) return canonicalize(resolve(t));
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
	via: string;
}

/** `<drive>:` names the current directory on that drive, which the gate cannot
 * read; treated as that drive's root (a root grant is never remembered). */
function asAbsoluteTarget(workdir: string, raw: string): string {
	const t = raw.trim();
	if (/^[A-Za-z]:$/.test(t)) return `${t}\\`;
	return isAbsolute(t) ? t : resolve(workdir, t);
}

async function candidateDirs(workdir: string, toolName: string, args: unknown): Promise<CandidateDir[]> {
	const raw = args as Record<string, unknown>;
	const found: CandidateDir[] = [];
	const seen = new Set<string>();
	const push = async (p: string, via = "工具参数"): Promise<void> => {
		if (found.length >= MAX_DIRS_PER_CALL) return;
		const dir = await toDir(asAbsoluteTarget(workdir, p));
		if (!dir || seen.has(dir)) return;
		seen.add(dir);
		found.push({ dir, label: dir, isUrl: false, via });
	};
	const pushUrl = (u: string, via = "工具参数"): void => {
		if (found.length >= MAX_DIRS_PER_CALL) return;
		if (!u || seen.has(u)) return;
		seen.add(u);
		found.push({ dir: u, label: u, isUrl: true, via });
	};

	if (toolName === "bash") {
		const command = typeof raw.command === "string" ? raw.command : "";
		const expanded = expandEnvRefs(command);
		// The `cd` target is examined first: in the common `cd <dir> && <cmd>` shape
		// the prompt should name the cd target itself rather than describing the same
		// path as a plain argument, which is what made users ask "why is it asking for
		// a directory I never touched?" (bug 3 of 0.1.15.6).
		for (const m of expanded.matchAll(CD_TARGET)) {
			const target = (m[1] ?? m[2] ?? m[3] ?? "").trim();
			if (!target || target === "/d" || target === "/D" || /^[&|;()]+$/.test(target)) continue;
			await push(asAbsoluteTarget(workdir, target), `命令中的 cd 目标 ${snippet((m[0] ?? target).trim())}`);
		}
		const pattern = process.platform === "win32" ? WIN_PATH : UNIX_PATH;
		for (const m of expanded.matchAll(pattern)) {
			const pathValue = normalizePath(m[0]);
			if (pathValue) await push(pathValue, `命令中的路径 ${snippet(m[0])}`);
		}
		if (process.platform === "win32") {
			for (const m of expanded.matchAll(DRIVE_ONLY)) {
				const drive = m[1] ?? "";
				if (drive) await push(drive, `命令中的盘符 ${snippet((m[0] ?? drive).trim())}`);
			}
		}
		for (const m of expanded.matchAll(DOT_FRAGMENT)) {
			const fragment = (m[1] ?? "").trim();
			if (!fragment || fragment === "." || fragment === "..") continue;
			await push(resolve(workdir, fragment), `命令中的相对路径 ${snippet(fragment)}`);
		}
		for (const m of expanded.matchAll(URL_HOST)) {
			if (m[1] && isLoopbackHost(m[1])) pushUrl(m[0]);
		}
		for (const m of expanded.matchAll(BARE_HOST)) {
			if (m[1] && isLoopbackHost(m[1]) && (m[1].includes(":") || m[2])) pushUrl(m[1]);
		}
		if (typeof raw.workdir === "string" && raw.workdir.trim()) {
			const wd = raw.workdir.trim();
			await push(asAbsoluteTarget(workdir, wd), `workdir 参数 ${snippet(wd)}`);
		}
		return found;
	}

	for (const pathValue of collectPathArgs(args)) {
		const trimmed = pathValue.trim();
		// Resolve relative paths against the agent workdir so the approval gate
		// checks the same directory the tool will actually touch.
		const located = isAbsolute(trimmed) || /^[A-Za-z]:$/.test(trimmed);
		await push(
			asAbsoluteTarget(workdir, trimmed),
			`${located ? "参数" : "参数（相对路径，按工作目录解析）"} ${snippet(trimmed)}`,
		);
	}
	return found;
}

/** Refusal handed back to the model. It keeps the historical prefix (logs, docs
 * and tests match on it) and adds where the path came from plus what to do next,
 * so the model stops retrying the same out-of-workdir shape. */
function blockReason(cand: CandidateDir, wd: string): string {
	const via = cand.via ? `（触发位置：${cand.via}）` : "";
	return (
		`用户未授权访问目录: ${cand.dir}${via}。当前工作目录: ${wd}。` +
		"提示：cd 到工作目录之外、或引用工作目录之外的路径都会触发审批；目标在工作目录内时，" +
		"请直接使用工作目录内的绝对路径，不要先 cd 到工作目录之外。"
	);
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
					via: cand.via,
					workdir: wd,
				},
				signal,
			);
			if (typeof ok === "object" && ok !== null) {
				const scope = await canonicalize(resolve(ok.scope));
				if (scope && contains(scope, cand.dir) && !isFilesystemRoot(scope)) {
					if (!alreadyApproved(scope)) approvedDirs.push(scope);
				} else {
					return { block: true, reason: blockReason(cand, wd) };
				}
			} else if (ok === "always") {
				// "always" on a volume root would hand over the whole drive, so a
				// root is granted for this call only and asked again next time.
				if (!isFilesystemRoot(cand.dir)) approvedDirs.push(cand.dir);
			} else if (ok !== true) {
				return { block: true, reason: blockReason(cand, wd) };
			}
		}
		return undefined;
	};
}
