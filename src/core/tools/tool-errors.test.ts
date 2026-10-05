import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyPatchSchema } from "./apply-patch.ts";
import { createBashTool } from "./bash.ts";

const dirs: string[] = [];

afterEach(() => {
	while (dirs.length) {
		const dir = dirs.pop();
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
});

describe("apply_patch op normalization", () => {
	it("defaults {path, oldString, newString} to edit", () => {
		const parsed = applyPatchSchema.safeParse({
			operations: [{ path: "a.ts", oldString: "x", newString: "y" }],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.operations[0]?.op).toBe("edit");
	});
	it("defaults {path, content} to add", () => {
		const parsed = applyPatchSchema.safeParse({
			operations: [{ path: "b.ts", content: "hello" }],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.operations[0]?.op).toBe("add");
	});
	it("defaults {path} alone to delete", () => {
		const parsed = applyPatchSchema.safeParse({ operations: [{ path: "c.ts" }] });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.operations[0]?.op).toBe("delete");
	});
	it("maps common op aliases", () => {
		const parsed = applyPatchSchema.safeParse({
			operations: [
				{ op: "create", path: "d.ts", content: "hi" },
				{ op: "update", path: "e.ts", oldString: "x", newString: "y" },
				{ op: "remove", path: "f.ts" },
			],
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.operations.map((o) => o.op)).toEqual(["add", "edit", "delete"]);
		}
	});
	it("still rejects empty operations", () => {
		expect(applyPatchSchema.safeParse({ operations: [] }).success).toBe(false);
	});
});

describe("bash error output", () => {
	it("includes the failed command and workdir", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-bash-"));
		dirs.push(cwd);
		const tool = createBashTool(cwd);
		let message = "";
		try {
			await tool.execute(
				{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
				{ command: "exit 1" },
			);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		expect(message).toContain("Failed command:");
		expect(message).toContain("exit 1");
		expect(message).toContain(cwd);
	});
});
