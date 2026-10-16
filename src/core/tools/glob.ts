import { readdir, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import type { AgentTool } from "../types.ts";
import { canonicalize, contains } from "../permission.ts";
import { IGNORED_DIRS } from "./grep.ts";

const MAX_MATCHES = 100;

export const globSchema = z.object({
	pattern: z.string().describe("File name pattern (*, ?, **). Without a slash it matches the file name at any depth."),
	path: z.string().optional().describe("Directory to search in. Defaults to the working directory."),
});

export type GlobInput = z.infer<typeof globSchema>;

export function globToPathRegex(pattern: string): RegExp {
	const parts = pattern.split("/");
	const out: string[] = [];
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i] ?? "";
		if (part === "**") {
			out.push(i === parts.length - 1 ? ".*" : "(.*/)?");
			continue;
		}
		out.push(
			part
				.replace(/[.+^${}()|[\]\\]/g, "\\$&")
				.replace(/\*/g, "[^/]*")
				.replace(/\?/g, "[^/]"),
		);
		if (i < parts.length - 1) out.push("/");
	}
	return new RegExp(`^${out.join("")}$`);
}

export function createGlobTool(cwd: string): AgentTool<typeof globSchema> {
	return {
		name: "glob",
		label: "glob",
		description:
			`Find files by name pattern inside ${cwd} without reading them. Each match includes the file size in bytes, so use this to locate files and to check file sizes instead of shell for-loops. Use this instead of \`dir /s /b ... | head\` or \`ls ... | head\` pipelines: results are capped at 100 matches (enough for everyday projects) with a narrowing hint when truncated. Use grep to search inside file contents.`,
		parameters: globSchema,
		async execute(call, { pattern, path }) {
			const rawRoot = path ? (isAbsolute(path) ? path : resolve(cwd, path)) : cwd;
			const [rootCanonical, cwdCanonical] = await Promise.all([canonicalize(rawRoot), canonicalize(cwd)]);
			if (!contains(cwdCanonical, rootCanonical)) {
				return {
					content: `搜索范围超出当前工作目录，已拒绝执行：${rawRoot} 不在 ${cwd} 内。请把 path 缩小到工作目录内，或先切换工作目录后再搜。`,
					details: { root: rawRoot, cwd },
				};
			}
			const root = rawRoot;
			const matchNameOnly = !pattern.includes("/");
			const nameRegex = matchNameOnly ? globToPathRegex(pattern) : null;
			const pathRegex = matchNameOnly ? null : globToPathRegex(pattern);
			const matches: Array<{ file: string; size?: number }> = [];
			const checkAborted = (): void => {
				if (call.signal?.aborted) throw new Error("Search aborted");
			};

			const walk = async (dir: string): Promise<void> => {
				checkAborted();
				if (matches.length >= MAX_MATCHES) return;
				let entries;
				try {
					entries = await readdir(dir, { withFileTypes: true });
				} catch {
					return;
				}
				for (const entry of entries) {
					checkAborted();
					if (matches.length >= MAX_MATCHES) return;
					const full = join(dir, entry.name);
					if (entry.isDirectory()) {
						if (!IGNORED_DIRS.has(entry.name)) await walk(full);
					} else if (entry.isFile()) {
						const hit = nameRegex
							? nameRegex.test(entry.name)
							: pathRegex?.test(relative(root, full).split(sep).join("/"));
						if (hit) {
							const info = await stat(full).catch(() => null);
							matches.push({ file: full, size: info?.size });
						}
					}
				}
			};

			const info = await stat(root).catch(() => null);
			if (info?.isDirectory()) await walk(root);

			if (matches.length === 0) {
				return { content: `No files matching pattern: ${pattern}`, details: { root } };
			}
			const body = matches
				.map(({ file, size }) => (size === undefined ? file : `${file} (${size} bytes)`))
				.join("\n");
			const truncated = matches.length >= MAX_MATCHES ? `\n\n[Truncated: more than ${MAX_MATCHES} matches; narrow the pattern or path]` : "";
			return { content: `${body}${truncated}`, details: { root, matches: matches.length } };
		},
	};
}
