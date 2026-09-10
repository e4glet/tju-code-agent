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

			const occurrences = content.split(oldString).length - 1;
			if (occurrences === 0) {
				throw new Error(buildNotFoundError(absolute, oldString, content));
			}
			if (!replaceAll && occurrences > 1) {
				throw new Error(
					`old_string matched ${occurrences} times in ${absolute}. Provide more surrounding context to make it unique, or set replaceAll: true.`,
				);
			}

			const updated = replaceAll
				? content.split(oldString).join(newString)
				: content.replace(oldString, newString);
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
					`Applied edit to ${absolute} (${occurrences} replacement${occurrences > 1 ? "s" : ""}).\n` +
					`Context:\n${contextLines.map((l) => `  ${l}`).join("\n")}`,
				details: { path: absolute, replacements: occurrences },
			};
		},
	};
}