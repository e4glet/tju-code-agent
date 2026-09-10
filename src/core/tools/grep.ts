import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import type { AgentTool } from "../types.ts";

const IGNORED_DIRS = new Set([
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

export const grepSchema = z.object({
	pattern: z.string().describe("Regular expression to search for"),
	path: z.string().optional().describe("File or directory to search in. Defaults to the working directory."),
	include: z
		.array(z.string())
		.optional()
		.describe('Optional glob patterns of file names to include (e.g. ["*.ts", "*.tsx"])'),
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
			"Search file contents for a regular expression pattern. Returns matching lines as `file:line: content`. " +
			"Searches recursively, skipping node_modules/.git and large or binary files.",
		parameters: grepSchema,
		promptSnippet: "search file contents",
		async execute(_call, { pattern, path, include }) {
			const root = path ? (isAbsolute(path) ? path : resolve(cwd, path)) : cwd;
			const regex = new RegExp(pattern);
			const includeMatchers = include?.map(globToRegex);
			const matches: Array<[string, number, string]> = [];

			const isIncluded = (fileName: string): boolean => {
				if (!includeMatchers?.length) return true;
				return includeMatchers.some((matcher) => matcher.test(fileName));
			};

			const walk = async (dir: string): Promise<void> => {
				if (matches.length >= MAX_MATCHES) return;
				let entries;
				try {
					entries = await readdir(dir, { withFileTypes: true });
				} catch {
					return;
				}
				for (const entry of entries) {
					if (matches.length >= MAX_MATCHES) return;
					const full = join(dir, entry.name);
					if (entry.isDirectory()) {
						if (!IGNORED_DIRS.has(entry.name)) await walk(full);
					} else if (entry.isFile() && isIncluded(entry.name)) {
						await searchFile(full, regex, matches);
					}
				}
			};

			const info = await stat(root).catch(() => null);
			if (info?.isFile()) {
				await searchFile(root, regex, matches);
			} else {
				await walk(root);
			}

			if (matches.length === 0) {
				return { content: `No matches for pattern: ${pattern}`, details: { root } };
			}
			const body = matches
				.map(([file, line, text]) => `${file}:${line}: ${text}`)
				.join("\n");
			const truncated = matches.length >= MAX_MATCHES ? `\n\n[Truncated: more than ${MAX_MATCHES} matches]` : "";
			return { content: `${body}${truncated}`, details: { root, matches: matches.length } };
		},
	};
}

async function searchFile(file: string, regex: RegExp, matches: Array<[string, number, string]>): Promise<void> {
	const info = await stat(file).catch(() => null);
	if (!info?.isFile() || info.size > MAX_FILE_BYTES) return;
	const content = await readFile(file, "utf-8").catch(() => null);
	if (!content || content.includes("\u0000")) return;
	const lines = content.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		if (matches.length >= MAX_MATCHES) return;
		const line = lines[i];
		if (line !== undefined && regex.test(line)) {
			matches.push([file, i + 1, line.slice(0, 300)]);
		}
	}
}