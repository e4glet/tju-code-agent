import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import type { AgentTool } from "../types.ts";

export const IGNORED_DIRS = new Set([
	"node_modules",
	".git",
	".hg",
	".svn",
	"dist",
	"build",
	"out",
	".cache",
	".next",
	".turbo",
	".idea",
	".vscode",
	"coverage",
]);

const MAX_MATCHES = 200;
const MAX_FILE_BYTES = 1024 * 1024; // skip files larger than 1MB
const DEFAULT_CONTEXT = 2;
const MAX_CONTEXT = 10;
const MAX_CONTEXT_LINES = 200;
const MAX_KEPT_WINDOWS = 10;

export const grepSchema = z.object({
	pattern: z.string().describe("Regular expression to search for (no inline flags; use caseInsensitive)"),
	path: z.string().optional().describe("File or directory to search in. Defaults to the working directory."),
	include: z
		.array(z.string())
		.optional()
		.describe('Optional glob patterns of file names to include (e.g. ["*.ts", "*.tsx"])'),
	context: z
		.number()
		.int()
		.min(0)
		.max(MAX_CONTEXT)
		.optional()
		.describe("Lines of context around each match (default 2, 0 for matches only)"),
	caseInsensitive: z.boolean().optional().describe("Case-insensitive matching"),
});

export type GrepInput = z.infer<typeof grepSchema>;

function globToRegex(glob: string): RegExp {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
	return new RegExp(`^${escaped}$`);
}

export function createGrepTool(cwd: string): AgentTool<typeof grepSchema> {
	return {
		name: "grep",
		label: "grep",
		description:
			"Search file contents for a regular expression pattern. Prefer this over shell findstr/grep: one call shows matches with surrounding context, so there is usually no need to re-read the same region. " +
			"Searches recursively, skipping node_modules/.git and large or binary files. Use glob to find files by name first.",
		parameters: grepSchema,
		promptSnippet: "search file contents",
		async execute(call, { pattern, path, include, context, caseInsensitive }) {
			const root = path ? (isAbsolute(path) ? path : resolve(cwd, path)) : cwd;
			let regex: RegExp;
			try {
				regex = new RegExp(pattern, caseInsensitive ? "i" : "");
			} catch {
				throw new Error(
					`Invalid regular expression: ${pattern}` +
						(/\(\?[imsux-]+\)/.test(pattern) ? " (inline flags like (?i) are not supported; use caseInsensitive: true)" : ""),
				);
			}
			const contextLines = context ?? DEFAULT_CONTEXT;
			const includeMatchers = include?.map(globToRegex);
			const files: Array<{ file: string; lines: string[]; hits: number[] }> = [];
			let totalHits = 0;
			const aborted = (): boolean => call.signal?.aborted === true;
			const checkAborted = (): void => {
				if (aborted()) throw new Error("Search aborted");
			};

			const isIncluded = (fileName: string): boolean => {
				if (!includeMatchers?.length) return true;
				return includeMatchers.some((matcher) => matcher.test(fileName));
			};

			const walk = async (dir: string): Promise<void> => {
				checkAborted();
				if (totalHits >= MAX_MATCHES) return;
				let entries;
				try {
					entries = await readdir(dir, { withFileTypes: true });
				} catch {
					return;
				}
				for (const entry of entries) {
					checkAborted();
					if (totalHits >= MAX_MATCHES) return;
					const full = join(dir, entry.name);
					if (entry.isDirectory()) {
						if (!IGNORED_DIRS.has(entry.name)) await walk(full);
					} else if (entry.isFile() && isIncluded(entry.name)) {
						await searchFile(full);
					}
				}
			};

			const searchFile = async (file: string): Promise<void> => {
				if (totalHits >= MAX_MATCHES) return;
				const info = await stat(file).catch(() => null);
				if (!info?.isFile() || info.size > MAX_FILE_BYTES) return;
				const content = await readFile(file, "utf-8").catch(() => null);
				if (!content || content.includes("\u0000")) return;
				checkAborted();
				const lines = content.split(/\r?\n/);
				const hits: number[] = [];
				for (let i = 0; i < lines.length; i++) {
					if (totalHits >= MAX_MATCHES) break;
					if (regex.test(lines[i] ?? "")) {
						hits.push(i + 1);
						totalHits++;
					}
				}
				if (hits.length) files.push({ file, lines, hits });
			};

			const info = await stat(root).catch(() => null);
			if (info?.isFile()) {
				await searchFile(root);
			} else {
				await walk(root);
			}

			if (totalHits === 0) {
				return { content: `No matches for pattern: ${pattern}`, details: { root } };
			}
			const truncated = totalHits >= MAX_MATCHES ? `\n\n[Truncated: more than ${MAX_MATCHES} matches]` : "";
			return { content: `${renderHits(root, files, contextLines)}${truncated}`, details: { root, matches: totalHits } };
		},
	};
}

function displayPath(root: string, file: string, isFileRoot: boolean): string {
	const base = isFileRoot ? dirname(root) : root;
	const rel = relative(base, file).split(sep).join("/");
	return rel.startsWith("..") || isAbsolute(rel) ? file : rel;
}

function renderHits(
	root: string,
	files: Array<{ file: string; lines: string[]; hits: number[] }>,
	contextLines: number,
): string {
	const isFileRoot = files.length === 1 && files[0] !== undefined && files[0].file === root;
	const textOf = (lines: string[], n: number, trim: boolean): string => {
		const raw = (lines[n - 1] ?? "").slice(0, 300);
		return trim ? raw.trimStart() : raw;
	};
	if (!contextLines) {
		const out: string[] = [];
		for (const { file, lines, hits } of files) {
			const shown = displayPath(root, file, isFileRoot);
			for (const lineNo of hits) out.push(`${shown}:${lineNo}: ${textOf(lines, lineNo, false)}`);
		}
		return out.join("\n");
	}
	const wins: Array<{ shown: string; lines: string[]; start: number; end: number; hits: number[] }> = [];
	for (const { file, lines, hits } of files) {
		const shown = displayPath(root, file, isFileRoot);
		const merged: Array<[number, number]> = [];
		for (const lineNo of hits) {
			const start = Math.max(1, lineNo - contextLines);
			const end = Math.min(lines.length, lineNo + contextLines);
			const last = merged[merged.length - 1];
			if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
			else merged.push([start, end]);
		}
		for (const [start, end] of merged) wins.push({ shown, lines, start, end, hits });
	}
	const renderWindow = (w: { shown: string; lines: string[]; start: number; end: number; hits: number[] }): string[] => {
		const rows: string[] = [];
		for (let n = w.start; n <= w.end; n++) {
			const hit = w.hits.includes(n);
			rows.push(`${w.shown}${hit ? ":" : "-"}${n}${hit ? ": " : "- "}${textOf(w.lines, n, !hit)}`);
		}
		return rows;
	};
	const totalHits = files.reduce((sum, f) => sum + f.hits.length, 0);
	const full = wins.flatMap(renderWindow);
	if (full.length <= MAX_CONTEXT_LINES) return full.join("\n");
	const kept = wins.slice(0, MAX_KEPT_WINDOWS).flatMap(renderWindow);
	const restHits: string[] = [];
	for (const w of wins.slice(MAX_KEPT_WINDOWS)) {
		for (const lineNo of w.hits) {
			if (w.start <= lineNo && lineNo <= w.end) restHits.push(`${w.shown}:${lineNo}: ${textOf(w.lines, lineNo, false)}`);
		}
	}
	return (
		`${[...kept, ...restHits].join("\n")}\n\n[Showing first ${MAX_KEPT_WINDOWS} of ${wins.length} context windows ` +
		`(${totalHits} matches); narrow the pattern, pass include, or set context: 0]`
	);
}