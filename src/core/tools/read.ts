import { stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { AgentTool } from "../types.ts";

export function resolvePath(cwd: string, input: string): string {
	const trimmed = input.trim();
	return isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
}

export async function assertReadableFile(path: string): Promise<void> {
	const info = await stat(path);
	if (!info.isFile()) {
		throw new Error(`Not a file: ${path}`);
	}
}

export async function ensureParentDir(path: string): Promise<void> {
	const { mkdir } = await import("node:fs/promises");
	await mkdir(dirname(path), { recursive: true });
}

const MAX_READ_BYTES = 1024 * 1024; // 1MB
const MAX_READ_LINES = 2000; // cap whole-file reads to protect context

export const readSchema = z.object({
	path: z.string().describe("Path to the file to read, relative to the working directory or absolute"),
	offset: z
		.number()
		.int()
		.positive()
		.optional()
		.describe("Optional 1-based line number to start reading from"),
	limit: z.number().int().positive().optional().describe("Optional maximum number of lines to read"),
});

export type ReadInput = z.infer<typeof readSchema>;

export function createReadTool(cwd: string): AgentTool<typeof readSchema> {
	return {
		name: "read",
		label: "read",
		description:
			"Read a text file. Returns the file content with line numbers. Optionally read only a slice of the file using offset and limit.",
		parameters: readSchema,
		promptSnippet: "read a file",
		async execute(_ctx, { path, offset, limit }) {
			const absolute = resolvePath(cwd, path);
			await assertReadableFile(absolute);

			const { readFile } = await import("node:fs/promises");
			const buffer = await readFile(absolute);
			if (buffer.length > MAX_READ_BYTES) {
				throw new Error(
					`File too large (${buffer.length} bytes > 1MB). Use grep to search instead of reading the whole file.`,
				);
			}
			const lines = buffer.toString("utf-8").split(/\r?\n/);
			const effectiveLimit = limit ?? (lines.length > MAX_READ_LINES ? MAX_READ_LINES : undefined);
			let start = (offset ?? 1) - 1;
			let end = effectiveLimit !== undefined ? start + effectiveLimit : lines.length;
			start = Math.max(0, start);
			end = Math.min(lines.length, end);
			const truncated = end < lines.length;

			const selected = lines.slice(start, end);
			const numbered = selected.map((line, i) => `${start + i + 1}: ${line}`).join("\n");
			const header = `${absolute} (${lines.length} lines)`;
			const truncationNote = truncated
				? `\n\n[Output truncated: file has ${lines.length} lines. Use offset/limit to read more.]`
				: "";
			return {
				content:
					limit !== undefined
						? `${header}\n${numbered}\n\n[Showing lines ${start + 1}-${end}]${truncationNote}`
						: `${header}\n${numbered}${truncationNote}`,
				details: {
					path: absolute,
					startLine: start + 1,
					endLine: end,
					truncated,
				},
			};
		},
	};
}