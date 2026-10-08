import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyPatchSchema } from "./apply-patch.ts";
import { collapseQuotedNewlines, createBashTool, doubleLoopVariables, requoteSingles } from "./bash.ts";
import { createFetchTool, describeFetchError } from "./fetch.ts";
import { createGrepTool } from "./grep.ts";
import { createScanTool } from "./scan.ts";
import { fetchWithRetry } from "../../ai/utils.ts";

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
	it("returns non-fatal exits as success with the code attached", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-bash-"));
		dirs.push(cwd);
		const tool = createBashTool(cwd);
		const result = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ command: "exit 1" },
		);
		expect(result.content).toContain("[exit code 1]");
	});

	it("still throws when the command cannot run at all", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-bash-"));
		dirs.push(cwd);
		const tool = createBashTool(cwd);
		let message = "";
		try {
			await tool.execute(
				{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
				{ command: "definitely-not-a-real-command-xyz" },
			);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		expect(message).toContain("Failed command:");
		expect(message).toContain("definitely-not-a-real-command-xyz");
		expect(message).toContain(cwd);
	});

	it("runs in the per-call workdir", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-bash-"));
		dirs.push(cwd);
		mkdirSync(join(cwd, "sub"), { recursive: true });
		const tool = createBashTool(cwd);
		const result = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ command: `node -e "process.stdout.write(process.cwd())"`, workdir: "sub" },
		);
		expect(result.content.replace(/\\/g, "/")).toContain(join(cwd, "sub").replace(/\\/g, "/"));
	});

	it("forces utf-8 stdio for child processes", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-bash-"));
		dirs.push(cwd);
		const tool = createBashTool(cwd);
		const result = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ command: `node -e "process.stdout.write(process.env.PYTHONUTF8 + '/' + process.env.PYTHONIOENCODING)"` },
		);
		expect(result.content).toContain("1/utf-8");
	});
});

describe("bash interactive guard", () => {
	async function blocked(command: string): Promise<string> {
		const cwd = mkdtempSync(join(tmpdir(), "tju-bash-"));
		dirs.push(cwd);
		const tool = createBashTool(cwd);
		let message = "";
		try {
			await tool.execute({ toolCallId: "t1", signal: undefined, onUpdate: () => {} }, { command });
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		return message;
	}

	it("blocks piped pagers", async () => {
		expect(await blocked("echo hi | more")).toContain("Interactive command blocked");
		expect(await blocked("type big.txt |more.com")).toContain("|more");
	});

	it("blocks wait-for-input commands", async () => {
		expect(await blocked("pause")).toContain("pause");
		expect(await blocked("dir & pause>nul")).toContain("pause");
		expect(await blocked("choice /c YN /m proceed")).toContain("choice");
		expect(await blocked("set /p name=hi")).toContain("set /p");
	});

	it("blocks bare interpreter prompts", async () => {
		expect(await blocked("python")).toContain("Interactive command blocked");
		expect(await blocked("echo hi && node")).toContain("node");
	});

	it("leaves lookalikes and argued invocations alone", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-bash-"));
		dirs.push(cwd);
		const tool = createBashTool(cwd);
		const echoPause = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ command: "echo pause" },
		);
		expect(echoPause.content).toContain("pause");
		expect(echoPause.content).not.toContain("Interactive command blocked");
		const nodeVersion = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ command: "node --version" },
		);
		expect(nodeVersion.content).not.toContain("Interactive command blocked");
	});
});

describe("bash for-loop variables", () => {
	it("doubles single-letter loop variables for batch files", () => {
		expect(doubleLoopVariables('for %f in (*) do @echo %f')).toBe("for %%f in (*) do @echo %%f");
		expect(doubleLoopVariables('for /f "delims=" %f in (\'dir\') do @if %~zf==0 echo %f')).toBe(
			'for /f "delims=" %%f in (\'dir\') do @if %%~zf==0 echo %%f',
		);
		expect(doubleLoopVariables("echo %~nxf")).toBe("echo %%~nxf");
	});
	it("leaves env vars, args and literals alone", () => {
		expect(doubleLoopVariables("type %USERPROFILE%\\.ssh\\id_rsa")).toBe("type %USERPROFILE%\\.ssh\\id_rsa");
		expect(doubleLoopVariables("echo %PATH% %CD% 100%")).toBe("echo %PATH% %CD% 100%");
		expect(doubleLoopVariables("echo %%f %1 %* %~dp0")).toBe("echo %%f %1 %* %~dp0");
	});
	it("a rewritten for-loop actually runs", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-bash-"));
		dirs.push(cwd);
		const tool = createBashTool(cwd);
		const result = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ command: 'for %f in (a b) do @echo got-%f' },
		);
		expect(result.content).toContain("got-a");
		expect(result.content).toContain("got-b");
	});
});

describe("cmd.exe quoting normalisation", () => {
	it("rewrites a single-quoted script that contains cmd metacharacters", () => {
		expect(requoteSingles(`node -e 'if(1>0)console.log("ok")'`)).toBe(`node -e "if(1>0)console.log(\\"ok\\")"`);
		expect(requoteSingles(`node -e 'const a=1&&2'`)).toBe(`node -e "const a=1&&2"`);
	});
	it("leaves a single-quoted literal with no metacharacters untouched", () => {
		expect(requoteSingles(`findstr 'hello' f.txt`)).toBe(`findstr 'hello' f.txt`);
	});
	it("never touches an apostrophe in prose or unbalanced quotes", () => {
		expect(requoteSingles("echo it's fine")).toBe("echo it's fine");
		expect(requoteSingles(`findstr /c:"it's" f.txt`)).toBe(`findstr /c:"it's" f.txt`);
		expect(requoteSingles(`echo 'unclosed`)).toBe(`echo 'unclosed`);
	});
	it("joins the lines of an unterminated double-quoted span only", () => {
		expect(collapseQuotedNewlines(`node -e "a;\nb"`)).toBe(`node -e "a; b"`);
		expect(collapseQuotedNewlines("echo one\necho two")).toBe("echo one\r\necho two");
	});
	it("runs a single-quoted script with > in one call", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-bash-"));
		dirs.push(cwd);
		const tool = createBashTool(cwd);
		const result = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ command: `node -e 'if(1>0)console.log("gt-ok")'` },
		);
		expect(result.content).toContain("gt-ok");
		expect(readdirSync(cwd)).toEqual([]); // no stray 0-byte file from the `>`
	});
	it("runs a multi-line script argument in one call", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-bash-"));
		dirs.push(cwd);
		const tool = createBashTool(cwd);
		const result = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ command: `node -e "const n=2;\nconsole.log('multi',n)"` },
		);
		expect(result.content).toContain("multi 2");
	});
	it("explains a quoting failure instead of blaming a Unix command", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-bash-"));
		dirs.push(cwd);
		const tool = createBashTool(cwd);
		let message = "";
		try {
			// cmd.exe splits at the unquoted `&&`, so it tries to run the JS
			// fragment itself — the old hint told the model `console.log` was a
			// Unix binary, which sent it chasing a nonexistent command.
			await tool.execute(
				{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
				{ command: `node -v && console.log(1)` },
			);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		expect(message).toContain("DOUBLE quotes");
		expect(message).not.toContain("is a Unix command and does not exist");
	});
	it("still reports a genuinely missing Unix command as such", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-bash-"));
		dirs.push(cwd);
		const tool = createBashTool(cwd);
		let message = "";
		try {
			await tool.execute(
				{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
				{ command: "definitely-not-a-real-command-xyz" },
			);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		expect(message).toContain("does not exist in Windows cmd.exe");
	});
});

describe("fetch error diagnostics", () => {
	it("unfolds nested causes with the url attached", () => {
		const nested = new Error("fetch failed", {
			cause: new Error("ConnectTimeoutError", { cause: new Error("ENOTFOUND example.invalid") }),
		});
		const message = describeFetchError("https://example.invalid/x", nested);
		expect(message).toContain("https://example.invalid/x");
		expect(message).toContain("ENOTFOUND");
		expect(message).not.toBe("fetch failed");
	});
	it("handles non-error failures", () => {
		expect(describeFetchError("https://example.invalid/", "boom")).toContain("boom");
	});
	it("reports dns failures with the failing host", async () => {
		const tool = createFetchTool();
		let message = "";
		try {
			await tool.execute(
				{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
				{ url: "https://nonexistent.invalid/", timeout: 10 },
			);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		expect(message).toContain("https://nonexistent.invalid/");
		expect(message.length).toBeGreaterThan("fetch failed".length);
	});
	it("never fetches loopback even with allowPrivate", async () => {
		const tool = createFetchTool();
		for (const url of ["http://127.0.0.1:9/", "http://localhost:9/"]) {
			let message = "";
			try {
				await tool.execute(
					{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
					{ url, timeout: 10, allowPrivate: true },
				);
			} catch (error) {
				message = error instanceof Error ? error.message : String(error);
			}
			expect(message).toContain("loopback");
		}
	});
});

describe("grep context", () => {
	function seedLines(root: string): void {
		const lines = ["l1", "l2", "l3", "l4", "TARGET here", "l6", "l7", "l8", "l9", "l10"];
		writeFileSync(join(root, "a.ts"), lines.join("\n") + "\n");
	}

	it("shows context with hit/context markers and merges windows", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-grep-"));
		dirs.push(cwd);
		writeFileSync(join(cwd, "a.ts"), ["l1", "TARGET one", "TARGET two", "l4"].join("\n") + "\n");
		const tool = createGrepTool(cwd);
		const res = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ pattern: "TARGET" },
		);
		expect(res.content).toContain("a.ts:2: TARGET one");
		expect(res.content).toContain("a.ts-1- l1");
		expect(res.content.match(/TARGET/g)?.length).toBe(2);
	});

	it("uses relative paths", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-grep-"));
		dirs.push(cwd);
		seedLines(cwd);
		const tool = createGrepTool(cwd);
		const res = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ pattern: "TARGET", context: 0 },
		);
		expect(res.content).toContain("a.ts:5:");
		expect(res.content).not.toContain(cwd);
	});

	it("matches case-insensitively on demand and hints on (?i)", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-grep-"));
		dirs.push(cwd);
		seedLines(cwd);
		const tool = createGrepTool(cwd);
		const sensitive = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ pattern: "target", context: 0 },
		);
		expect(sensitive.content).toContain("No matches");
		const folded = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ pattern: "target", context: 0, caseInsensitive: true },
		);
		expect(folded.content).toContain("TARGET here");
		let message = "";
		try {
			await tool.execute(
				{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
				{ pattern: "(?i)target" },
			);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		expect(message).toContain("caseInsensitive");
	});

	it("trims indentation on context lines but keeps hit lines exact", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-grep-"));
		dirs.push(cwd);
		writeFileSync(join(cwd, "a.ts"), ["if (x) {", "\t\tconst TARGET = 1;", "}"].join("\n") + "\n");
		const tool = createGrepTool(cwd);
		const res = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ pattern: "TARGET", context: 1 },
		);
		expect(res.content).toContain("a.ts:2: \t\tconst TARGET = 1;");
		expect(res.content).toContain("a.ts-1- if (x) {");
		expect(res.content).toContain("a.ts-3- }");
	});

	it("degrades by keeping the first windows, not dropping all context", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-grep-"));
		dirs.push(cwd);
		const lines: string[] = [];
		for (let i = 1; i <= 360; i++) lines.push(i % 6 === 0 ? `HIT ${i}` : `pad ${i}`);
		writeFileSync(join(cwd, "big.ts"), lines.join("\n") + "\n");
		const tool = createGrepTool(cwd);
		const res = await tool.execute(
			{ toolCallId: "t1", signal: undefined, onUpdate: () => {} },
			{ pattern: "HIT" },
		);
		expect(res.content).toContain("Showing first 10 of");
		expect(res.content).toContain("-4- pad 4");
		expect(res.content).toContain("big.ts:360: HIT 360");
	});
});

describe("abort responsiveness", () => {	it("scan stops immediately on abort instead of waiting for npm audit", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-abort-"));
		dirs.push(cwd);
		const tool = createScanTool(cwd);
		const controller = new AbortController();
		controller.abort();
		const start = Date.now();
		await expect(
			tool.execute({ toolCallId: "t1", signal: controller.signal, onUpdate: () => {} }, { scope: "all" }),
		).rejects.toThrow("aborted");
		expect(Date.now() - start).toBeLessThan(5000);
	});

	it("grep stops immediately on abort", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "tju-abort-"));
		dirs.push(cwd);
		const tool = createGrepTool(cwd);
		const controller = new AbortController();
		controller.abort();
		await expect(
			tool.execute({ toolCallId: "t1", signal: controller.signal, onUpdate: () => {} }, { pattern: "x" }),
		).rejects.toThrow("Search aborted");
	});

	it("fetch retry backoff is interruptible", async () => {
		const { createServer } = await import("node:http");
		const server = createServer((req, res) => {
			res.writeHead(500, { "content-type": "text/plain" });
			res.end("boom");
		});
		await new Promise<void>((resolve) => {
			server.listen(0, "127.0.0.1", () => resolve());
		});
		try {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			const controller = new AbortController();
			setTimeout(() => controller.abort(), 100);
			const start = Date.now();
			await expect(
				fetchWithRetry(`http://127.0.0.1:${port}/`, { signal: controller.signal }, 3),
			).rejects.toThrow();
			expect(Date.now() - start).toBeLessThan(2000);
		} finally {
			server.close();
		}
	});
});
