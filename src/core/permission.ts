import { isAbsolute, resolve, dirname } from "node:path";
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

const FILE_TOOLS = new Set(["read", "write", "edit", "grep"]);

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

function toDir(p: string): string {
	const t = normalizePath(p);
	const last = t.split(/[\\/]/).pop() ?? "";
	const looksLikeFile = last.includes(".") && !/^\.+$/.test(last);
	return resolve(looksLikeFile ? dirname(t) : t);
}

function isInside(base: string, target: string): boolean {
	let b = resolve(base).replace(/[\\/]+$/, "");
	let t = resolve(target);
	if (process.platform === "win32") {
		b = b.toLowerCase();
		t = t.toLowerCase();
	}
	const sep = process.platform === "win32" ? "\\" : "/";
	if (t.length < b.length) return false;
	return t === b || t.startsWith(b + sep);
}

function candidateDirs(workdir: string, toolName: string, args: unknown): string[] {
	const raw = args as Record<string, unknown>;
	if (FILE_TOOLS.has(toolName)) {
		const pathValue = typeof raw.path === "string" ? raw.path : "";
		if (!pathValue.trim()) return [];
		const trimmed = pathValue.trim();
		// Resolve relative paths against the agent workdir so the approval gate
		// checks the same directory the tool will actually touch.
		const full = isAbsolute(trimmed) ? trimmed : resolve(workdir, trimmed);
		return [toDir(full)];
	}
	if (toolName === "bash") {
		const command = typeof raw.command === "string" ? raw.command : "";
		const pattern = process.platform === "win32" ? WIN_PATH : UNIX_PATH;
		const found: string[] = [];
		for (const m of command.matchAll(pattern)) {
			const pathValue = normalizePath(m[0]);
			if (pathValue) found.push(toDir(pathValue));
		}
		return found;
	}
	return [];
}

export function createApprovalGate(options: ApprovalGateOptions): (context: BeforeToolCallContext) => Promise<BeforeToolCallResult | undefined> {
	const workdir = resolve(options.workdir);
	const approvedDirs: string[] = [];

	const alreadyApproved = (dir: string): boolean => approvedDirs.some((a) => isInside(a, dir));

	return async (context) => {
		for (const dir of candidateDirs(workdir, context.toolCall.name, context.args)) {
			if (isInside(workdir, dir) || alreadyApproved(dir)) continue;
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