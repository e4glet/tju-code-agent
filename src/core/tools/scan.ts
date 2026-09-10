import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import type { AgentTool } from "../types.ts";

const IGNORED_DIRS = new Set([
	"node_modules",
	".git",
	".hg",
	".svn",
	"dist",
	"build",
	"out",
	".cache",
	".next",
	".turbo",
	".idea",
	".vscode",
	"coverage",
]);

const MAX_SCAN_BYTES = 1024 * 1024;
const MAX_FINDINGS = 50;

export const scanSchema = z.object({
	scope: z
		.enum(["secrets", "deps", "all"])
		.optional()
		.describe('What to scan: "secrets" for leaked keys, "deps" for dependency vulnerabilities, "all" for both (default).'),
	path: z.string().optional().describe("File or directory to scan. Defaults to the working directory."),
});

export type ScanInput = z.infer<typeof scanSchema>;

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
	{ name: "OpenAI key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
	{ name: "Anthropic key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
	{ name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
	{ name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
	{ name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
	{ name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
	{ name: "Stripe key", pattern: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{20,}\b/ },
	{ name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
	{ name: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
	{ name: "API key assignment", pattern: /\b(?:api[_-]?key|apikey)\s*[:=]\s*["'][^"']{16,}["']/i },
	{ name: "secret assignment", pattern: /\b(?:secret|token|password|passwd)\s*[:=]\s*["'][^"']{16,}["']/i },
];

interface SecretFinding {
	file: string;
	line: number;
	name: string;
	preview: string;
}

function resolveScanRoot(cwd: string, input?: string): string {
	if (!input) return cwd;
	return isAbsolute(input) ? input : resolve(cwd, input);
}

async function collectSecrets(root: string): Promise<SecretFinding[]> {
	const findings: SecretFinding[] = [];
	const scanFile = async (file: string): Promise<void> => {
		if (findings.length >= MAX_FINDINGS) return;
		const info = await stat(file).catch(() => null);
		if (!info?.isFile() || info.size > MAX_SCAN_BYTES) return;
		const content = await readFile(file, "utf-8").catch(() => null);
		if (!content || content.includes("\u0000")) return;
		const lines = content.split(/\r?\n/);
		for (let i = 0; i < lines.length; i++) {
			if (findings.length >= MAX_FINDINGS) return;
			const line = lines[i];
			if (!line) continue;
			for (const { name, pattern } of SECRET_PATTERNS) {
				if (pattern.test(line)) {
					findings.push({ file, line: i + 1, name, preview: line.slice(0, 200) });
					break;
				}
			}
		}
	};
	const walk = async (dir: string): Promise<void> => {
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (findings.length >= MAX_FINDINGS) return;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORED_DIRS.has(entry.name)) await walk(full);
			} else if (entry.isFile()) {
				await scanFile(full);
			}
		}
	};
	const info = await stat(root).catch(() => null);
	if (info?.isFile()) {
		await scanFile(root);
	} else {
		await walk(root);
	}
	return findings;
}

function formatSecrets(findings: SecretFinding[], root: string): string {
	if (findings.length === 0) {
		return `No secrets found in ${root}.`;
	}
	const body = findings
		.map((f) => `  ${f.file}:${f.line}: [${f.name}] ${f.preview}`)
		.join("\n");
	const truncated = findings.length >= MAX_FINDINGS ? `\n\n[Truncated: more than ${MAX_FINDINGS} findings]` : "";
	return `Found ${findings.length} possible secret(s) in ${root}:\n${body}${truncated}`;
}

interface DepFinding {
	name: string;
	severity: string;
	advisory: string;
}

interface KnownVulnerability {
	name: string;
	range: string;
	severity: string;
	advisory: string;
}

const KNOWN_VULNERABILITIES: KnownVulnerability[] = [
	{
		name: "lodash",
		range: "<4.17.21",
		severity: "high",
		advisory: "prototype pollution (CVE-2021-23337)",
	},
	{
		name: "minimist",
		range: "<1.2.6",
		severity: "high",
		advisory: "prototype pollution (CVE-2021-44906)",
	},
	{
		name: "glob-parent",
		range: "<5.1.2",
		severity: "high",
		advisory: "ReDoS (CVE-2020-28469)",
	},
	{
		name: "nth-check",
		range: "<2.0.1",
		severity: "high",
		advisory: "ReDoS (CVE-2021-3803)",
	},
	{
		name: "shell-quote",
		range: "<1.7.3",
		severity: "high",
		advisory: "command injection (CVE-2021-42740)",
	},
];

function compareVersions(a: string, b: string): number {
	const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
	const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++) {
		const x = pa[i] ?? 0;
		const y = pb[i] ?? 0;
		if (x !== y) return x < y ? -1 : 1;
	}
	return 0;
}

function satisfiesRange(version: string, range: string): boolean {
	const match = range.match(/^([<>]=?)\s*(\d[\w.+-]*)$/);
	if (!match) return false;
	const op = match[1] ?? "";
	const fixed = match[2] ?? "";
	const cmp = compareVersions(version, fixed);
	if (op === "<") return cmp < 0;
	if (op === "<=") return cmp <= 0;
	if (op === ">") return cmp > 0;
	if (op === ">=") return cmp >= 0;
	return false;
}

async function scanDeps(cwd: string): Promise<{ online: boolean; body: string }> {
	const pkgPath = resolve(cwd, "package.json");
	const pkg = await readFile(pkgPath, "utf-8").catch(() => null);
	if (!pkg) {
		return { online: false, body: `No package.json found in ${cwd}; skipping dependency scan.` };
	}
	let manifest: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	try {
		manifest = JSON.parse(pkg) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
	} catch {
		return { online: false, body: `package.json in ${cwd} is not valid JSON; skipping dependency scan.` };
	}
	const deps = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };

	const auditOutput = await runNpmAudit(cwd);
	if (auditOutput !== null) {
		return { online: true, body: formatAuditReport(auditOutput) };
	}

	const findings: DepFinding[] = [];
	for (const { name, range, severity, advisory } of KNOWN_VULNERABILITIES) {
		const requested = deps[name];
		if (!requested) continue;
		const installed = await resolveInstalledVersion(cwd, name);
		const version = installed ?? requested.replace(/[^0-9.]/g, "");
		if (installed ? satisfiesRange(version, range) : true) {
			findings.push({ name, severity, advisory });
		}
	}
	if (findings.length === 0) {
		return {
			online: false,
			body: "npm audit unavailable (offline or not installed). Known-vulnerability list checked: no matches.",
		};
	}
	const body = findings.map((f) => `  ${f.name}: [${f.severity}] ${f.advisory}`).join("\n");
	return {
		online: false,
		body: `npm audit unavailable (offline or not installed). Known-vulnerability list matched ${findings.length}:\n${body}`,
	};
}

async function resolveInstalledVersion(cwd: string, name: string): Promise<string | null> {
	const lockPath = resolve(cwd, "package-lock.json");
	const lock = await readFile(lockPath, "utf-8").catch(() => null);
	if (!lock) return null;
	try {
		const data = JSON.parse(lock) as {
			packages?: Record<string, { version?: string }>;
		};
		return data.packages?.[`node_modules/${name}`]?.version ?? null;
	} catch {
		return null;
	}
}

function runNpmAudit(cwd: string): Promise<string | null> {
	const isWindows = process.platform === "win32";
	const command = isWindows ? "npm.cmd" : "npm";
	const args = ["audit", "--json"];
	const invocation = isWindows
		? { executable: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/c", command, ...args] }
		: { executable: command, args };
	return new Promise((resolveExec) => {
		const child = spawn(invocation.executable, invocation.args, {
			cwd,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		let out = "";
		let err = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			out += chunk.toString("utf-8");
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			err += chunk.toString("utf-8");
		});
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			resolveExec(null);
		}, 60_000);
		child.on("error", () => {
			clearTimeout(timer);
			resolveExec(null);
		});
		child.on("close", () => {
			clearTimeout(timer);
			if (!out.trim()) {
				resolveExec(null);
				return;
			}
			try {
				JSON.parse(out);
				resolveExec(out);
			} catch {
				resolveExec(null);
			}
		});
	});
}

function formatAuditReport(auditJson: string): string {
	let data: {
		metadata?: { vulnerabilities?: Record<string, number> };
		vulnerabilities?: Record<string, { severity: string; isDirect?: boolean; via?: unknown }>;
	};
	try {
		data = JSON.parse(auditJson);
	} catch {
		return "npm audit ran but returned unparseable output.";
	}
	const counts = data.metadata?.vulnerabilities ?? {};
	const total = Object.values(counts).reduce((a, b) => a + b, 0);
	if (total === 0) {
		return "npm audit: no known vulnerabilities.";
	}
	const lines = [`npm audit: ${total} vulnerability(ies) found (${JSON.stringify(counts)}):`];
	for (const [name, vuln] of Object.entries(data.vulnerabilities ?? {})) {
		if (lines.length >= 20) {
			lines.push("  ... (truncated)");
			break;
		}
		const direct = vuln.isDirect ? " [direct dep]" : "";
		lines.push(`  ${name}: [${vuln.severity}]${direct}`);
	}
	return lines.join("\n");
}

export function createScanTool(cwd: string): AgentTool<typeof scanSchema> {
	return {
		name: "scan",
		label: "scan",
		description:
			"Run a security scan over the project. Detects leaked secrets (API keys, tokens, private keys) in source " +
			"and checks dependencies for known vulnerabilities via npm audit (falls back to a built-in known-vulnerability " +
			"list when offline). Run after writing code and before committing.",
		parameters: scanSchema,
		promptSnippet: "scan the project for secrets and vulnerable dependencies",
		async execute(_call, { scope, path }) {
			const root = resolveScanRoot(cwd, path);
			const wantSecrets = scope !== "deps";
			const wantDeps = scope !== "secrets";
			const parts: string[] = [];
			if (wantSecrets) {
				const findings = await collectSecrets(root);
				parts.push(formatSecrets(findings, root));
			}
			if (wantDeps) {
				const deps = await scanDeps(cwd);
				parts.push(deps.body);
			}
			return { content: parts.join("\n\n") };
		},
	};
}
