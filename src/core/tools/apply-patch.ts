import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { AgentTool } from "../types.ts";
import { ensureParentDir, resolvePath } from "./read.ts";

const applyOpSchema = z.discriminatedUnion("op", [
	z.object({
		op: z.literal("add"),
		path: z.string().describe("Path of the file to create, relative to the working directory or absolute"),
		content: z.string().describe("Full content of the new file"),
	}),
	z.object({
		op: z.literal("edit"),
		path: z.string().describe("Path of the file to edit, relative to the working directory or absolute"),
		oldString: z.string().min(1).describe("The exact text to replace (must match exactly once)"),
		newString: z.string().describe("The replacement text"),
	}),
	z.object({
		op: z.literal("delete"),
		path: z.string().describe("Path of the file to delete, relative to the working directory or absolute"),
	}),
]);

export const applyPatchSchema = z.object({
	operations: z
		.array(applyOpSchema)
		.min(1)
		.describe("The operations to apply sequentially; they may touch multiple files"),
});

export type ApplyPatchInput = z.infer<typeof applyPatchSchema>;

async function atomicWrite(absolute: string, content: string): Promise<void> {
	const temp = `${absolute}.${process.pid}.${Date.now()}.tmp`;
	try {
		await writeFile(temp, content, "utf-8");
		await rename(temp, absolute);
	} catch (error) {
		await rm(temp, { force: true }).catch(() => {});
		throw error;
	}
}

/**
 * Apply a sequence of add / edit / delete operations across one or more files
 * in a single tool call. Operations apply in order; if one fails, the earlier
 * operations remain applied and the error lists what succeeded.
 */
export function createApplyPatchTool(cwd: string): AgentTool<typeof applyPatchSchema> {
	return {
		name: "apply_patch",
		label: "apply_patch",
		description:
			"Apply a sequence of add / edit / delete file operations across one or more files in a single tool call. Operations apply in order; if one fails, the earlier operations remain applied and the error lists what succeeded. Prefer this over repeated edit/write calls when changing multiple files at once.",
		parameters: applyPatchSchema,
		promptSnippet: "apply multiple file changes in one call",
		async execute(_call, { operations }) {
			const applied: string[] = [];
			for (const op of operations) {
				const absolute = resolvePath(cwd, op.path);
				try {
					if (op.op === "add") {
						const info = await stat(absolute).catch(() => null);
						if (info) throw new Error(`file already exists: ${absolute}`);
						await ensureParentDir(absolute);
						await atomicWrite(absolute, op.content);
						applied.push(`add ${absolute}`);
					} else if (op.op === "edit") {
						const info = await stat(absolute).catch(() => null);
						if (!info || !info.isFile()) throw new Error(`not a file: ${absolute}`);
						const content = await readFile(absolute, "utf-8");
						const occurrences = content.split(op.oldString).length - 1;
						if (occurrences === 0) {
							throw new Error(
								`could not find old_string in ${absolute} (0 matches); re-read the file first`,
							);
						}
						if (occurrences > 1) {
							throw new Error(
								`old_string matched ${occurrences} times in ${absolute}; provide more surrounding context or split the edit`,
							);
						}
						await atomicWrite(absolute, content.replace(op.oldString, op.newString));
						applied.push(`edit ${absolute}`);
					} else {
						await rm(absolute, { force: true });
						applied.push(`delete ${absolute}`);
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					throw new Error(
						applied.length > 0
							? `apply_patch applied ${applied.length} operation(s) before failing at ${op.op} ${op.path}: ${message}\nApplied: ${applied.join(", ")}`
							: `apply_patch failed at ${op.op} ${op.path}: ${message}`,
					);
				}
			}
			return {
				content: `Applied ${applied.length} operation(s):\n${applied.map((a) => `- ${a}`).join("\n")}`,
				details: { applied },
			};
		},
	};
}
