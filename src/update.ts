import { accessSync, constants, existsSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { platform, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

export interface UpdateFile {
	path: string;
	sha256: string;
	size: number;
}

export interface UpdateManifest {
	version: string;
	files: UpdateFile[];
}

export interface InstallRoot {
	root: string;
	distDir: string;
	cliJs: string;
}

const STAGING_NAME = "dist.new";
const BACKUP_NAME = "dist.bak";
const SWAP_NAME = "dist.swap";
const MAX_FILES = 200;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30000;

function fail(message: string): never {
	throw new Error(message);
}

function splitVersion(v: string): { nums: number[]; pre: string | null } {
	const m = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?/.exec(v.trim());
	if (!m || !m[1]) return { nums: [], pre: v.trim() || null };
	return { nums: m[1].split(".").map((x) => Number(x)), pre: m[2] ?? null };
}

export function compareVersions(a: string, b: string): number {
	const pa = splitVersion(a);
	const pb = splitVersion(b);
	if (!pa.nums.length || !pb.nums.length) return pa.pre === pb.pre ? 0 : pa.pre! < pb.pre! ? -1 : 1;
	const len = Math.max(pa.nums.length, pb.nums.length);
	for (let i = 0; i < len; i++) {
		const x = pa.nums[i] ?? 0;
		const y = pb.nums[i] ?? 0;
		if (x !== y) return x < y ? -1 : 1;
	}
	if (pa.pre === pb.pre) return 0;
	if (pa.pre === null) return 1;
	if (pb.pre === null) return -1;
	return pa.pre < pb.pre ? -1 : 1;
}

export function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, "");
}

async function fetchBuffer(url: string): Promise<Buffer> {
	const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	if (!res.ok) fail(`下载失败 HTTP ${res.status}：${url}`);
	return Buffer.from(await res.arrayBuffer());
}

function checkManifestShape(value: unknown): asserts value is UpdateManifest {
	if (!value || typeof value !== "object") fail("更新源数据损坏：latest.json 不是对象");
	const m = value as { version?: unknown; files?: unknown };
	if (typeof m.version !== "string" || !m.version) fail("更新源数据损坏：缺少 version");
	if (!Array.isArray(m.files) || m.files.length === 0 || m.files.length > MAX_FILES) {
		fail("更新源数据损坏：files 非法");
	}
	let total = 0;
	for (const f of m.files) {
		const file = f as { path?: unknown; sha256?: unknown; size?: unknown };
		if (typeof file.path !== "string" || !file.path || file.path.includes("..") || file.path.startsWith("/")) {
			fail("更新源数据损坏：文件路径非法");
		}
		if (typeof file.sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(file.sha256)) {
			fail("更新源数据损坏：缺少 sha256");
		}
		if (typeof file.size !== "number" || file.size < 0 || file.size > MAX_FILE_BYTES) {
			fail("更新源数据损坏：文件大小非法");
		}
		total += file.size;
	}
	if (total > MAX_TOTAL_BYTES) fail("更新包过大，已拒绝");
}

export async function fetchManifest(baseUrl: string): Promise<UpdateManifest> {
	let value: unknown;
	try {
		const res = await fetch(`${normalizeBaseUrl(baseUrl)}/latest.json`, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!res.ok) fail(`更新源请求失败 HTTP ${res.status}`);
		value = await res.json();
	} catch (err) {
		if (err instanceof Error && err.message.startsWith("更新源")) throw err;
		fail(`无法连接更新源：${err instanceof Error ? err.message : String(err)}`);
	}
	checkManifestShape(value);
	return value;
}

export async function checkForUpdate(
	baseUrl: string,
	currentVersion: string,
): Promise<{ current: string; latest: string; available: boolean }> {
	const manifest = await fetchManifest(baseUrl);
	return { current: currentVersion, latest: manifest.version, available: compareVersions(manifest.version, currentVersion) > 0 };
}

export function resolveInstallRoot(): InstallRoot {
	const argv1 = process.argv[1];
	if (!argv1) fail("无法定位程序目录");
	const cliJs = resolve(process.cwd(), argv1);
	const distDir = dirname(cliJs);
	if (basename(distDir).toLowerCase() !== "dist") fail("仅发行版 dist 目录支持自更新");
	const root = dirname(distDir);
	try {
		accessSync(root, constants.W_OK);
	} catch {
		fail("安装目录不可写，无法更新");
	}
	return { root, distDir, cliJs };
}

export function hasBackup(root: string): boolean {
	try {
		return existsSync(join(root, BACKUP_NAME));
	} catch {
		return false;
	}
}

function sha256Hex(buf: Buffer): string {
	return createHash("sha256").update(buf).digest("hex");
}

function safeJoin(stagingDir: string, rel: string): string {
	return join(stagingDir, ...rel.split("/"));
}

export async function stageRelease(baseUrl: string, manifest: UpdateManifest, stagingDir: string): Promise<void> {
	rmSync(stagingDir, { recursive: true, force: true });
	mkdirSync(stagingDir, { recursive: true });
	const base = `${normalizeBaseUrl(baseUrl)}/files/${encodeURIComponent(manifest.version)}`;
	try {
		for (const file of manifest.files) {
			const buf = await fetchBuffer(`${base}/${file.path.split("/").map(encodeURIComponent).join("/")}`);
			if (buf.length > MAX_FILE_BYTES) fail(`文件过大，已中止：${file.path}`);
			if (sha256Hex(buf).toLowerCase() !== file.sha256.toLowerCase()) fail(`校验失败，已中止：${file.path}`);
			const dest = safeJoin(stagingDir, file.path);
			mkdirSync(dirname(dest), { recursive: true });
			writeFileSync(dest, buf);
		}
	} catch (err) {
		rmSync(stagingDir, { recursive: true, force: true });
		throw err;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function desensitizeArgs(args: string[]): string[] {
	const out = args.slice();
	for (let i = 0; i < out.length; i++) {
		const arg = out[i];
		if (arg === undefined) continue;
		const eq = arg.indexOf("=");
		const name = eq === -1 ? arg : arg.slice(0, eq);
		if (name !== "--api-key") continue;
		if (eq !== -1) out[i] = `${name}=***`;
		else if (i + 1 < out.length) out[i + 1] = "***";
	}
	return out;
}

async function renameRetry(from: string, to: string, attempts = 5): Promise<void> {
	let last: unknown = null;
	for (let i = 0; i < attempts; i++) {
		try {
			renameSync(from, to);
			return;
		} catch (err) {
			last = err;
			if (i < attempts - 1) await sleep(200);
		}
	}
	throw last instanceof Error ? last : new Error(String(last));
}

export async function swapToRelease(root: string, stagingDir: string): Promise<void> {
	const distDir = join(root, "dist");
	const backupDir = join(root, BACKUP_NAME);
	if (!existsSync(stagingDir)) fail("暂存的新版本不存在，可能下载失败");
	rmSync(backupDir, { recursive: true, force: true });
	try {
		await renameRetry(distDir, backupDir);
	} catch (err) {
		fail(`备份当前版本失败：${err instanceof Error ? err.message : String(err)}`);
	}
	try {
		await renameRetry(stagingDir, distDir);
	} catch (err) {
		try {
			await renameRetry(backupDir, distDir);
		} catch {
			// best effort rollback of the backup step
		}
		fail(`切换新版本失败，已尝试恢复：${err instanceof Error ? err.message : String(err)}`);
	}
}

export async function swapRollback(root: string): Promise<void> {
	const distDir = join(root, "dist");
	const backupDir = join(root, BACKUP_NAME);
	const swapDir = join(root, SWAP_NAME);
	if (!existsSync(backupDir)) fail("没有可回滚的备份（dist.bak 不存在）");
	await renameRetry(distDir, swapDir);
	try {
		await renameRetry(backupDir, distDir);
	} catch (err) {
		try {
			await renameRetry(swapDir, distDir);
		} catch {
			// best effort rollback of the first step
		}
		fail(`回滚失败，已尝试恢复：${err instanceof Error ? err.message : String(err)}`);
	}
	try {
		await renameRetry(swapDir, backupDir);
	} catch (err) {
		fail(`已回滚到备份版本，但旧备份未能归位（残留 ${SWAP_NAME}，可手动删除）：${err instanceof Error ? err.message : String(err)}`);
	}
}

function escapeCmdArg(a: string): string {
	if (/[ \t"]/.test(a)) return a;
	return a.replace(/([&<>()@^|%!])/g, "^$1");
}

export function relaunch(root: string, args: string[]): void {
	const stamp = new Date().toISOString();
	const logLine = (s: string): void => {
		try {
			writeFileSync(join(root, "update-last.log"), `${stamp} ${s}\n`, { flag: "a" });
		} catch {
			// ignore logging failures
		}
	};
	const target = [process.execPath, join(root, "dist", "cli.js"), ...args];
	let child: ReturnType<typeof spawn>;
	try {
		if (platform() === "win32") {
			child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "Tju code", ...target.map(escapeCmdArg)], {
				detached: true,
				stdio: "ignore",
			});
		} else {
			child = spawn(target[0] ?? process.execPath, target.slice(1), {
				detached: true,
				stdio: "ignore",
			});
		}
	} catch (err) {
		logLine(`spawn failed: ${err instanceof Error ? err.message : String(err)}`);
		throw err;
	}
	logLine(`spawned pid=${child.pid} ${desensitizeArgs(target).join(" ")}`);
	child.on("error", (err) => {
		logLine(`child error: ${err instanceof Error ? err.message : String(err)}`);
	});
	child.unref();
}

export function stagingDirFor(root: string): string {
	return join(root, STAGING_NAME);
}
