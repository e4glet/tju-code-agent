import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApplyPatchTool } from "./apply-patch.ts";
import { createEditTool } from "./edit.ts";
import { createGlobTool, globToPathRegex } from "./glob.ts";
import { createApprovalGate } from "../permission.ts";

const dirs: string[] = [];

function freshDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "tju-globedit-"));
	dirs.push(dir);
	return dir;
}

afterEach(() => {
	while (dirs.length) {
		const dir = dirs.pop();
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
});

function seedTree(root: string): void {
	mkdirSync(join(root, "src", "nested"), { recursive: true });
	mkdirSync(join(root, "node_modules", "dep"), { recursive: true });
	writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
	writeFileSync(join(root, "src", "nested", "b.ts"), "export const b = 2;\n");
	writeFileSync(join(root, "README.md"), "# hi\n");
	writeFileSync(join(root, "node_modules", "dep", "c.ts"), "export const c = 3;\n");
}

async function run(tool: { execute: (...args: never[]) => Promise<{ content: string }> }, args: unknown) {
	return await tool.execute(
		{ toolCallId: "t1", signal: undefined, onUpdate: () => {} } as never,
		args as never,
	);
}

describe("globToPathRegex", () => {
	it("matches basenames for patterns without a slash", () => {
		expect(globToPathRegex("*.ts").test("a.ts")).toBe(true);
		expect(globToPathRegex("*.ts").test("a.js")).toBe(false);
		expect(globToPathRegex("b.??").test("b.ts")).toBe(true);
	});
	it("supports ** across directories", () => {
		expect(globToPathRegex("src/**/*.ts").test("src/nested/b.ts")).toBe(true);
		expect(globToPathRegex("src/**/*.ts").test("src/a.ts")).toBe(true);
		expect(globToPathRegex("src/*.ts").test("src/nested/b.ts")).toBe(false);
		expect(globToPathRegex("src/*.ts").test("src/a.ts")).toBe(true);
	});
});

describe("glob tool", () => {
	it("finds files by name at any depth and skips ignored dirs", async () => {
		const root = freshDir();
		seedTree(root);
		const res = await run(createGlobTool(root), { pattern: "*.ts" });
		expect(res.content).toContain(join(root, "src", "a.ts"));
		expect(res.content).toContain(join(root, "src", "nested", "b.ts"));
		expect(res.content).not.toContain("node_modules");
	});
	it("supports relative path patterns", async () => {
		const root = freshDir();
		seedTree(root);
		const res = await run(createGlobTool(root), { pattern: "src/*.ts" });
		expect(res.content).toContain("a.ts");
		expect(res.content).not.toContain("b.ts");
	});
	it("reports each match with its size in bytes", async () => {
		const root = freshDir();
		seedTree(root);
		const res = await run(createGlobTool(root), { pattern: "README.md" });
		expect(res.content).toContain(`README.md (5 bytes)`);
	});
	it("reports no matches instead of erroring", async () => {
		const root = freshDir();
		seedTree(root);
		const res = await run(createGlobTool(root), { pattern: "*.go" });
		expect(res.content).toContain("No files matching pattern");
		const missing = await run(createGlobTool(root), { pattern: "*.ts", path: join(root, "nope") });
		expect(missing.content).toContain("No files matching pattern");
	});
	it("truncates at 100 matches with a narrowing hint", async () => {
		const root = freshDir();
		mkdirSync(join(root, "many"), { recursive: true });
		for (let i = 0; i < 120; i++) writeFileSync(join(root, "many", `f${i}.txt`), "x\n");
		const res = await run(createGlobTool(root), { pattern: "*.txt" });
		expect(res.content).toContain("more than 100 matches");
	});
});

describe("edit whitespace-insensitive fallback", () => {
	it("still applies exact matches without a fuzzy note", async () => {
		const root = freshDir();
		writeFileSync(join(root, "a.ts"), "const x = 1;\n");
		const res = await run(createEditTool(root), { path: "a.ts", oldString: "const x = 1;", newString: "const x = 2;" });
		expect(res.content).toContain("Applied edit");
		expect(res.content).not.toContain("whitespace-insensitive");
	});
	it("applies indentation-drifted matches and says so", async () => {
		const root = freshDir();
		writeFileSync(join(root, "a.ts"), "function f() {\n\t\treturn 42;\n}\n");
		const res = await run(createEditTool(root), {
			path: "a.ts",
			oldString: "function f() {\n  return 42;\n}",
			newString: "function f() {\n  return 43;\n}",
		});
		expect(res.content).toContain("whitespace-insensitive match");
		expect(res.content).toContain("Applied edit");
	});
	it("still throws a helpful error when nothing matches", async () => {
		const root = freshDir();
		writeFileSync(join(root, "a.ts"), "const x = 1;\n");
		await expect(
			run(createEditTool(root), { path: "a.ts", oldString: "something entirely absent here", newString: "y" }),
		).rejects.toThrow("Could not find the old_string");
	});
	it("does not fuzzy-match ambiguous repeats", async () => {
		const root = freshDir();
		writeFileSync(join(root, "a.ts"), "foo(1);\nfoo(1);\n");
		await expect(
			run(createEditTool(root), { path: "a.ts", oldString: "foo(1);", newString: "bar(1);" }),
		).rejects.toThrow("matched 2 times");
		writeFileSync(join(root, "b.ts"), "callServerAlpha( );\ncallServerAlpha(  );\n");
		await expect(
			run(createEditTool(root), {
				path: "b.ts",
				oldString: "callServerAlpha(   );",
				newString: "callServerBeta();",
			}),
		).rejects.toThrow("Could not find the old_string");
	});
	it("refuses tiny fuzzy matches", async () => {
		const root = freshDir();
		writeFileSync(join(root, "a.ts"), "x=1;\ny=2;\n");
		await expect(
			run(createEditTool(root), { path: "a.ts", oldString: "x = 1;", newString: "x = 9;" }),
		).rejects.toThrow("Could not find the old_string");
	});
	it("applies fuzzy replaceAll across repeats", async () => {
		const root = freshDir();
		writeFileSync(join(root, "a.ts"), "\tcallServerAlpha();\n\tcallServerAlpha();\n");
		const res = await run(createEditTool(root), {
			path: "a.ts",
			oldString: "  callServerAlpha();",
			newString: "callServerBeta();",
			replaceAll: true,
		});
		expect(res.content).toContain("2 replacements");
	});
	it("apply_patch also benefits from the fallback", async () => {
		const root = freshDir();
		writeFileSync(join(root, "a.ts"), "function f() {\n\t\treturn 42;\n}\n");
		const res = await run(createApplyPatchTool(root), {
			operations: [{ op: "edit", path: "a.ts", oldString: "function f() {\n  return 42;\n}", newString: "ok" }],
		});
		expect(res.content).toContain("Applied 1 operation");
	});
});

describe("glob permission gate", () => {
	it("asks for workdir-external search roots and honours the answer", async () => {
		const work = freshDir();
		const outside = freshDir();
		const seen: string[] = [];
		const gate = createApprovalGate({
			workdir: work,
			ask: async (request) => {
				seen.push(request.scopeDir);
				return false;
			},
		});
		const blocked = await gate({
			toolCall: { type: "toolCall", id: "t1", name: "glob", arguments: {} },
			args: { pattern: "*.ts", path: join(outside, "f.ts") },
		});
		expect(blocked?.block).toBe(true);
		expect(seen.length).toBe(1);

		const open = createApprovalGate({ workdir: work, ask: async () => true });
		const allowed = await open({
			toolCall: { type: "toolCall", id: "t2", name: "glob", arguments: {} },
			args: { pattern: "*.ts", path: join(outside, "f.ts") },
		});
		expect(allowed).toBeUndefined();

		const inside = await open({
			toolCall: { type: "toolCall", id: "t3", name: "glob", arguments: {} },
			args: { pattern: "*.ts" },
		});
		expect(inside).toBeUndefined();
	});

	it("asks for an out-of-workdir bash workdir", async () => {
		const work = freshDir();
		const outside = freshDir();
		const seen: string[] = [];
		const gate = createApprovalGate({
			workdir: work,
			ask: async (request) => {
				seen.push(request.scopeDir);
				return false;
			},
		});
		const blocked = await gate({
			toolCall: { type: "toolCall", id: "t1", name: "bash", arguments: {} },
			args: { command: "echo hi", workdir: outside },
		});
		expect(blocked?.block).toBe(true);
		expect(seen.length).toBe(1);
	});
});
