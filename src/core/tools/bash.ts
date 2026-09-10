import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import type { AgentTool, AgentToolResult, ToolCallArgs } from "../types.ts";

export const bashSchema = z.object({
	command: z.string().describe("Shell command to execute"),
	timeout: z
		.number()
		.int()
		.positive()
		.optional()
		.describe("Optional timeout in seconds. No timeout when omitted."),
});

export type BashInput = z.infer<typeof bashSchema>;

export interface BashToolOptions {
	/** Working directory for commands. Defaults to the tool's base directory. */
	workdir?: string;
	/** Explicit shell executable. Defaults to $SHELL on unix, cmd.exe on Windows. */
	shell?: string;
}

const MAX_KEPT_OUTPUT = 256 * 1024; // keep at most 256KB in-memory
const MAX_TRUNCATED_CAPTURE = 4 * 1024 * 1024; // drop after 4MB to bound memory
const TRUNCATED_DIR_TTL_MS = 24 * 60 * 60 * 1000; // remove stale truncated-output dirs after 24h

// Unix commands commonly used by models but absent in Windows cmd.exe, with runnable alternatives.
const WINDOWS_UNIX_HINTS: Record<string, string> = {
	head: 'powershell -Command "Get-Content <file> -TotalCount <n>"',
	tail: 'powershell -Command "Get-Content <file> -Tail <n>"',
	grep: 'findstr /n "pattern" <file>',
	ls: "dir",
	cat: "type <file>",
	rm: "del <file>  (directories: rmdir /s /q <dir>)",
	mv: "move <src> <dst>",
	cp: "copy <src> <dst>",
	mkdir: "mkdir <path>  (cmd creates intermediate dirs automatically)",
	touch: "type nul > <file>",
	diff: "fc <file1> <file2>",
	wc: 'find /c /v "" <file>   (line count)',
	which: "where <name>",
	pwd: "cd",
	sort: "sort",
	env: "set",
	find: "dir /s /b <pattern>",
};

const NOT_RECOGNIZED_RE = /'([^']+)' is not recognized as an internal or external command/i;

/** Build a friendly hint when cmd.exe reports an unrecognized command (exit 9009). */
function windowsCommandHint(exitCode: number | null, output: string): string | null {
	const m = NOT_RECOGNIZED_RE.exec(output);
	const name = m ? m[1] : null;
	if (!name) return null;
	const alt = WINDOWS_UNIX_HINTS[name.toLowerCase()];
	const suffix = alt ? ` On Windows cmd.exe use: ${alt}` : "";
	return (
		`HINT: '${name}' is a Unix command and does not exist in Windows cmd.exe.${suffix}` +
		" Prefer Windows syntax (dir/type/findstr/where) or PowerShell."
	);
}

/** Remove old truncated-output temp dirs so they do not accumulate forever. */
async function cleanStaleTempDirs(): Promise<void> {
	const dirs = await readdir(tmpdir(), { withFileTypes: true }).catch(() => []);
	const now = Date.now();
	for (const entry of dirs) {
		if (!entry.isDirectory() || !entry.name.startsWith("tju-code-bash-")) continue;
		const full = join(tmpdir(), entry.name);
		const info = await stat(full).catch(() => null);
		if (info && now - info.mtimeMs > TRUNCATED_DIR_TTL_MS) {
			await rm(full, { recursive: true, force: true }).catch(() => {});
		}
	}
}

function resolveWorkdir(base: string, workdir?: string): string {
	const target = workdir ?? ".";
	return isAbsolute(target) ? target : resolve(base, target);
}

function killTree(child: ChildProcess): void {
	if (!child.pid) return;
	if (process.platform === "win32") {
		try {
			spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
		} catch {
			// fall through to direct kill
		}
	}
	try {
		child.kill("SIGKILL");
	} catch {
		// already gone
	}
}

function shellSpec(shell?: string): { executable: string; args: (command: string) => string[] } {
	if (shell) {
		return { executable: shell, args: (command) => ["-c", command] };
	}
	const executable = process.env.SHELL ?? "/bin/sh";
	return { executable, args: (command) => ["-c", command] };
}

async function prepareWindowsInvocation(command: string): Promise<{ executable: string; args: string[] }> {
	const executable = process.env.ComSpec ?? "cmd.exe";
	const tempDir = await mkdtemp(join(tmpdir(), "tju-code-cmd-"));
	const script = join(tempDir, "run.bat");
	const body = `@echo off\r\nchcp 65001 >nul\r\n${command}\r\nexit /b %errorlevel%\r\n`;
	await writeFile(script, body, "utf-8");
	return { executable, args: ["/d", "/c", script] };
}

export function createBashTool(cwd: string, options: BashToolOptions = {}): AgentTool<typeof bashSchema> {
	const workdir = resolveWorkdir(cwd, options.workdir);
	const { executable, args } = shellSpec(options.shell);
	const isWindows = process.platform === "win32" && !options.shell;
	return {
		name: "bash",
		label: "bash",
		description:
			`Execute a shell command in ${workdir}. Returns stdout/stderr. Output is truncated when very large. ` +
			(isWindows
				? "On Windows this runs cmd.exe, so use Windows syntax (mkdir, not mkdir -p). "
				: "") +
			"Supports an optional timeout in seconds.",
		parameters: bashSchema,
		promptSnippet: "execute a shell command (this tool runs locally)",
		async execute(call: ToolCallArgs, input: BashInput) {
			const invocation = isWindows
				? await prepareWindowsInvocation(input.command)
				: { executable, args: args(input.command) };
			const child = spawn(invocation.executable, invocation.args, {
				cwd: workdir,
				env: process.env,
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});

			let captured = "";
			let dropped = false;
			const append = (chunk: Buffer) => {
				captured += chunk.toString("utf-8");
				if (captured.length > MAX_TRUNCATED_CAPTURE) {
					captured = captured.slice(-MAX_KEPT_OUTPUT);
					dropped = true;
				}
			};

			let lastUpdate = 0;
			const emitUpdate = () => {
				const now = Date.now();
				if (now - lastUpdate < 120) return;
				lastUpdate = now;
				call.onUpdate?.({ content: captured });
			};
			const onData = (chunk: Buffer) => {
				append(chunk);
				emitUpdate();
			};
			child.stdout?.on("data", onData);
			child.stderr?.on("data", onData);

			const { exitCode, timedOut } = await new Promise<{ exitCode: number | null; timedOut: boolean }>(
				(resolveExec, reject) => {
					let timer: NodeJS.Timeout | undefined;
					const onAbort = () => killTree(child);
					if (call.signal?.aborted) onAbort();
					else call.signal?.addEventListener("abort", onAbort, { once: true });
					if (input.timeout !== undefined) {
						timer = setTimeout(() => {
							killTree(child);
							resolveExec({ exitCode: null, timedOut: true });
						}, input.timeout * 1000);
					}
					child.on("error", (err) => {
						if (timer) clearTimeout(timer);
						call.signal?.removeEventListener("abort", onAbort);
						reject(err);
					});
					child.on("close", (code) => {
						if (timer) clearTimeout(timer);
						call.signal?.removeEventListener("abort", onAbort);
						resolveExec({ exitCode: code, timedOut: false });
					});
				},
			);

			const output = captured.trim() || "(no output)";
			if (call.signal?.aborted) {
				throw new Error("Command aborted");
			}
			if (timedOut) {
				throw new Error(`Command timed out after ${input.timeout ?? 0} seconds.\n${output}`);
			}
			if (exitCode !== 0) {
				const hint = isWindows ? windowsCommandHint(exitCode, output) : null;
				throw new Error(`Command exited with code ${exitCode}.\n${output}${hint ? "\n" + hint : ""}`);
			}
			return await finalizeResult(captured, dropped, output);
		},
	};
}

async function finalizeResult(
	captured: string,
	dropped: boolean,
	output: string,
): Promise<AgentToolResult> {
	if (!dropped) {
		return { content: output, details: {} };
	}
	await cleanStaleTempDirs();
	const tempDir = await mkdtemp(join(tmpdir(), "tju-code-bash-"));
	const fullPath = join(tempDir, "output.txt");
	await writeFile(fullPath, captured, "utf-8");
	return {
		content: `${output}\n\n[Output truncated (kept last ~${(MAX_KEPT_OUTPUT / 1024) | 0}KB). Full output: ${fullPath}]`,
		details: { truncated: true, fullOutputPath: fullPath },
	};
}