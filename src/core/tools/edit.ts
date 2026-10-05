import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { AgentTool } from "../types.ts";
import { assertReadableFile, resolvePath } from "./read.ts";

export const editSchema = z.object({
	path: z.string().describe("Path to the file to edit, relative to the working directory or absolute"),
	oldString: z
		.string()
		.min(1, "oldString must not be empty")
		.describe("The exact text to replace"),
	newString: z.string().describe("The replacement text"),
	replaceAll: z
		.boolean()
		.optional()
		.describe("Replace every occurrence. When false (default), oldString must match exactly once."),
});

export type EditInput = z.infer<typeof editSchema>;

export type ReplaceAttempt =
	| { updated: string; replacements: number; fuzzy: boolean }
	| { updated: null; exactOccurrences: number };

const MIN_FUZZY_CHARS = 8;

function stripWhitespace(s: string): { text: string; index: number[] } {
	const chars: string[] = [];
	const index: number[] = [];
	for (let i = 0; i < s.length; i++) {
		const ch = s[i] ?? "";
		if (/\s/.test(ch)) continue;
		chars.push(ch);
		index.push(i);
	}
	return { text: chars.join(""), index };
}

export function tryReplace(
	content: string,
	oldString: string,
	newString: string,
	replaceAll: boolean,
): ReplaceAttempt {
	const exactOccurrences = content.split(oldString).length - 1;
	if (exactOccurrences === 1 || (replaceAll && exactOccurrences > 0)) {
		return {
			updated: replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString),
			replacements: exactOccurrences,
			fuzzy: false,
		};
	}
	if (exactOccurrences > 1) return { updated: null, exactOccurrences };
	const stripped = stripWhitespace(oldString);
	if (stripped.text.length < MIN_FUZZY_CHARS) return { updated: null, exactOccurrences };
	const flat = stripWhitespace(content);
	const spans: Array<[number, number]> = [];
	let from = 0;
	for (;;) {
		const at = flat.text.indexOf(stripped.text, from);
		if (at === -1) break;
		spans.push([flat.index[at] ?? 0, (flat.index[at + stripped.text.length - 1] ?? 0) + 1]);
		from = at + stripped.text.length;
		if (!replaceAll && spans.length > 1) break;
	}
	if (spans.length === 0 || (!replaceAll && spans.length > 1)) {
		return { updated: null, exactOccurrences };
	}
	let updated = content;
	for (let i = spans.length - 1; i >= 0; i--) {
		const span = spans[i];
		if (!span) continue;
		updated = updated.slice(0, span[0]) + newString + updated.slice(span[1]);
	}
	return { updated, replacements: spans.length, fuzzy: true };
}

function buildNotFoundError(absolute: string, oldString: string, content: string): string {
	const firstLine = (oldString.split("\n").find((l) => l.trim()) ?? oldString).trim();
	const needle = firstLine.slice(0, 80);
	const lines = content.split("\n");
	const hit = needle.length >= 4 ? lines.findIndex((l) => l.includes(needle)) : -1;
	let excerpt: string;
	if (hit >= 0) {
		const start = Math.max(0, hit - 2);
		const end = Math.min(lines.length, hit + 3);
		excerpt = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join("\n");
	} else {
		const head = lines.slice(0, 15);
		excerpt = head.map((l, i) => `${i + 1}: ${l}`).join("\n");
	}
	return (
		`Could not find the old_string in ${absolute} (found 0 matches). ` +
		"Check for differences in whitespace/newlines and re-read the section before retrying.\n" +
		`Nearby lines:\n${excerpt}`
	);
}

export function createEditTool(cwd: string): AgentTool<typeof editSchema> {
	return {
		name: "edit",
		label: "edit",
		description:
			"Make a targeted text replacement in a file. The old_string must match exactly once (unless replaceAll is set). Use write() to create or replace whole files.",
		parameters: editSchema,
		promptSnippet: "edit a file with an exact string replacement",
		async execute(_call, { path, oldString, newString, replaceAll }) {
			const absolute = resolvePath(cwd, path);
			await assertReadableFile(absolute);
			const content = await readFile(absolute, "utf-8");

			const attempt = tryReplace(content, oldString, newString, replaceAll ?? false);
			if (attempt.updated === null) {
				if (attempt.exactOccurrences > 1) {
					throw new Error(
						`old_string matched ${attempt.exactOccurrences} times in ${absolute}. Provide more surrounding context to make it unique, or set replaceAll: true.`,
					);
				}
				throw new Error(buildNotFoundError(absolute, oldString, content));
			}
			const updated = attempt.updated;
			const occurrences = attempt.replacements;
			await writeFile(absolute, updated, "utf-8");

			const contextLines: string[] = [];
			for (const line of updated.split("\n")) {
				if (line.includes(newString.split("\n")[0] ?? "")) {
					contextLines.push(line.trim());
					if (contextLines.length >= 3) break;
				}
			}
			return {
				content:
					(attempt.fuzzy ? "(whitespace-insensitive match) " : "") +
					`Applied edit to ${absolute} (${occurrences} replacement${occurrences > 1 ? "s" : ""}).\n` +
					`Context:\n${contextLines.map((l) => `  ${l}`).join("\n")}`,
				details: { path: absolute, replacements: occurrences },
			};
		},
	};
}