import { z } from "zod";
import type { AgentTool } from "../types.ts";
import { ensureParentDir, resolvePath } from "./read.ts";

export const writeSchema = z.object({
	path: z.string().describe("Path to the file to write, relative to the working directory or absolute"),
	content: z.string().describe("The full file content to write"),
});

export type WriteInput = z.infer<typeof writeSchema>;

export function createWriteTool(cwd: string): AgentTool<typeof writeSchema> {
	return {
		name: "write",
		label: "write",
		description:
			"Write the given content to a file, creating parent directories. Overwrites existing content. Use edit() for small targeted changes.",
		parameters: writeSchema,
		promptSnippet: "write a file",
		async execute(_call, { path, content }) {
			const absolute = resolvePath(cwd, path);
			await ensureParentDir(absolute);
			const { writeFile, rename, rm } = await import("node:fs/promises");
			const temp = `${absolute}.${process.pid}.${Date.now()}.tmp`;
			try {
				await writeFile(temp, content, "utf-8");
				await rename(temp, absolute);
			} catch (error) {
				await rm(temp, { force: true }).catch(() => {});
				throw error;
			}
			const bytes = Buffer.byteLength(content, "utf-8");
			return {
				content: `Wrote ${bytes} bytes to ${absolute}`,
				details: { path: absolute, bytes, lines: content.split("\n").length },
			};
		},
	};
}