import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
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
	workdir: z
		.string()
		.optional()
		.describe("Directory to run in, relative to the agent directory or absolute. Prefer this over `cd` prefixes."),
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

// Unix commands commonly used by models but absent in Windows cmd.exe. File
// lookup and content search are covered by the glob/grep tools — prefer those
// over shell equivalents so results stay structured and small.
const WINDOWS_UNIX_HINTS: Record<string, string> = {
	head: 'powershell -Command "Get-Content <file> -TotalCount <n>"',
	tail: 'powershell -Command "Get-Content <file> -Tail <n>"',
	grep: "use the grep tool instead of findstr",
	ls: "dir (or the glob tool to find files by name)",
	cat: "use the read tool",
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
	find: "use the glob tool (by name) or the grep tool (by content)",
};

const NOT_RECOGNIZED_RE = /'([^']+)' is not recognized as an internal or external command/i;
const UNEXPECTED_RE = /was unexpected at this time/i;

// Only these mean "the command could not run at all" (missing binary, no
// permission, broken batch syntax, killed). Any other non-zero exit —
// findstr with no matches, del of a missing file, git outside a repo — is a
// normal result, reported with its code instead of thrown as an error, so the
// model is not tricked into a wasted explain-and-retry turn.
function isFatalExit(exitCode: number | null, output: string, isWindows: boolean): boolean {
	if (exitCode === null) return true;
	if (exitCode === 126 || exitCode === 127 || exitCode === 9009) return true;
	return isWindows && (NOT_RECOGNIZED_RE.test(output) || UNEXPECTED_RE.test(output));
}

const LOOP_VAR_RE = /(?<!%)%(~[A-Za-z$]*?)?([A-Za-z])(?![A-Za-z0-9%])/g;

export function doubleLoopVariables(command: string): string {
	return command.replace(LOOP_VAR_RE, "%%$1$2");
}

// cmd.exe has no single-quote quoting: it passes `'` through verbatim, so any
// cmd metacharacter inside a single-quoted argument (`>`, `|`, `&`, parens) is
// parsed as shell syntax. That fails the command outright (`node -e 'a||b'` →
// "9009 'console.log' is not recognized") and worse, a stray `>` silently
// creates 0-byte files named after the JS that followed it. Rewriting a
// balanced single-quoted span as a double-quoted one (escaping inner quotes)
// preserves the author's intent: `'a > b'` and `"a > b"` mean the same thing in
// every shell the model is likely thinking of.
const CMD_METACHARS = /[<>|&^()]/;

export function requoteSingles(command: string): string {
	// Only when quotes are balanced and no double quote is left open — an
	// apostrophe in prose ("echo it's fine") must never be rewritten.
	let openSingles = 0;
	let inDouble = false;
	for (const ch of command) {
		if (ch === '"') inDouble = !inDouble;
		else if (ch === "'" && !inDouble) openSingles++;
	}
	if (inDouble || openSingles % 2 !== 0) return command;

	let out = "";
	let inSingle = false;
	inDouble = false;
	let span = "";
	for (const ch of command) {
		if (inSingle) {
			if (ch === "'") {
				// Only convert spans that cmd would actually misparse; a plain
				// `'literal'` with no metacharacters already works as-is, so it is
				// left exactly as written (no needless rewriting).
				out += CMD_METACHARS.test(span) ? `"${span.replace(/"/g, '\\"')}"` : `'${span}'`;
				span = "";
				inSingle = false;
				continue;
			}
			span += ch;
			continue;
		}
		if (ch === '"') inDouble = !inDouble;
		if (ch === "'" && !inDouble) {
			inSingle = true;
			continue;
		}
		out += ch;
	}
	return inSingle ? command : out;
}

// A newline inside an unterminated double-quoted span is literal to cmd, which
// splits the command mid-string: a multi-line `node -e "…"` dies with 9009. The
// lines of that span are one logical argument, so join them with a space. Real
// line breaks *between* commands (echo a / echo b) are left alone.
export function collapseQuotedNewlines(command: string): string {
	const out: string[] = [];
	let buffer = "";
	let inDouble = false;
	for (const line of command.split(/\r?\n/)) {
		for (const ch of line) if (ch === '"') inDouble = !inDouble;
		if (inDouble) {
			buffer = buffer ? `${buffer} ${line}` : line;
			continue;
		}
		out.push(buffer ? `${buffer} ${line}` : line);
		buffer = "";
	}
	if (buffer) out.push(buffer);
	return out.join("\r\n");
}

const MAX_ERROR_OUTPUT = 4000;

function shortenErrorOutput(output: string): string {
	const text = output.trim() || "(no output)";
	if (text.length <= MAX_ERROR_OUTPUT) return text;
	return `${text.slice(0, MAX_ERROR_OUTPUT)}\n...[error output truncated, kept first ${MAX_ERROR_OUTPUT} chars]`;
}

function errorHeader(command: string, workdir: string): string {
	const cmd = command.length > 500 ? `${command.slice(0, 500)}...[truncated]` : command;
	return `Failed command:\n  cwd: ${workdir}\n  command: ${cmd}`;
}

function errorFooter(output: string): string {
	if (output.trim()) return "";
	return "The command produced no output, so the exit code is the only clue. Re-run with explicit output (echo markers, dir/type to confirm paths) instead of retrying blindly.";
}

/** Build a friendly hint when cmd.exe reports an unrecognized command (exit 9009). */
function windowsCommandHint(exitCode: number | null, output: string): string | null {
	if (UNEXPECTED_RE.test(output)) {
		return (
			"HINT: this is a cmd.exe batch parsing error (the command runs inside a temporary .bat file, " +
			"where loop variables need double percent signs). Rewrite `for %f` as `for %%f`, quote paths with " +
			"spaces, or avoid `for` loops entirely with PowerShell."
		);
	}
	const m = NOT_RECOGNIZED_RE.exec(output);
	const name = m ? m[1] : null;
	if (!name) return null;
	// cmd.exe quoted a *fragment* of JavaScript as if it were a command name
	// (`'console.log' is not recognized`) — the real mistake is the quoting, not
	// a missing Unix binary, so do not send the model hunting for `console.log`.
	if (/[.()[\]]/.test(name)) {
		return (
			`HINT: cmd.exe tried to run \`${name}\` as a command, which means the quotes around your script ` +
			"were consumed before reaching node. cmd.exe does NOT treat single quotes as quotes: " +
			"`node -e 'a||b'` and unquoted `node -e if(1>0)…` are split at `|` / `>` (the `>` even creates a " +
			"stray file named after the code that followed). Wrap the script in DOUBLE quotes and keep any " +
			"JavaScript strings inside it single-quoted: node -e \"console.log('hi')\"."
		);
	}
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

const PAGER_PIPE = /\|\s*(more|less|most)(\s|$|[./])/i;
const WAIT_COMMAND = /(?:^|[&|;()\r\n])\s*(pause|choice)(?:[\s/>]|$)/im;
const SET_PROMPT = /\bset\s*\/p\b/i;
const PAGED_HOST = /\|\s*out-host\s+-paging/i;
const BARE_REPL = /(?:^|[&|;()\r\n])\s*(python|python3|py|node|cmd|powershell|pwsh)(?=\s*(?:$|[&|;)\r\n]))/im;

function matchInteractiveCommand(command: string): string | null {
	if (typeof command !== "string") return null;
	for (const pattern of [PAGER_PIPE, WAIT_COMMAND, SET_PROMPT, PAGED_HOST, BARE_REPL]) {
		const hit = pattern.exec(command);
		if (hit) return hit[0].trim();
	}
	return null;
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
	const normalized = collapseQuotedNewlines(requoteSingles(command));
	const body = `@echo off\r\nchcp 65001 >nul\r\n${doubleLoopVariables(normalized)}\r\nexit /b %errorlevel%\r\n`;
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
			"Supports an optional timeout in seconds. Never use interactive commands or pagers (more, pause, bare python/node prompts).",
		parameters: bashSchema,
		promptSnippet: "execute a shell command (this tool runs locally)",
		async execute(call: ToolCallArgs, input: BashInput) {
			const interactive = matchInteractiveCommand(input.command);
			if (interactive) {
				throw new Error(
					`Interactive command blocked: ${interactive} waits for keyboard input and would hang forever. ` +
						"Rerun without pagers, prompts, or bare interpreter prompts (tool output is captured and truncated automatically).",
				);
			}
			const runDir = input.workdir
				? isAbsolute(input.workdir)
					? input.workdir
					: resolve(workdir, input.workdir)
				: workdir;
			const invocation = isWindows
				? await prepareWindowsInvocation(input.command)
				: { executable, args: args(input.command) };
			const child = spawn(invocation.executable, invocation.args, {
				cwd: runDir,
				env: {
					...process.env,
					PYTHONUTF8: process.env.PYTHONUTF8 ?? "1",
					PYTHONIOENCODING: process.env.PYTHONIOENCODING ?? "utf-8",
				},
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});

			let captured = "";
			let dropped = false;
			const decoder = new StringDecoder("utf-8");
			const append = (chunk: Buffer) => {
				captured += decoder.write(chunk);
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

			captured += decoder.end();
			const output = captured.trim() || "(no output)";
			const errBody = shortenErrorOutput(captured);
			const header = errorHeader(input.command, runDir);
			if (call.signal?.aborted) {
				throw new Error("Command aborted");
			}
			if (timedOut) {
				throw new Error(`${header}\nCommand timed out after ${input.timeout ?? 0} seconds.\n${errBody}`);
			}
			if (exitCode !== 0 && isFatalExit(exitCode, output, isWindows)) {
				const hint = isWindows ? windowsCommandHint(exitCode, output) : null;
				const footer = errorFooter(output);
				throw new Error(`${header}\nCommand exited with code ${exitCode}.\n${errBody}${hint ? `\n${hint}` : ""}${footer ? `\n${footer}` : ""}`);
			}
			if (exitCode !== 0) {
				return await finalizeResult(captured, dropped, `[exit code ${exitCode}]\n${output}`);
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