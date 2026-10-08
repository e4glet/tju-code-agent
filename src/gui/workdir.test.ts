import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkCwdConfirm, listChildDirs, listDrives, resolveWorkdirInput } from "./workdir.ts";

const dirs: string[] = [];

function freshDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "tju-workdir-"));
	dirs.push(dir);
	return dir;
}

afterEach(() => {
	while (dirs.length) {
		const dir = dirs.pop();
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
});

describe("resolveWorkdirInput", () => {
	it("treats missing or blank input as use-default", async () => {
		expect(await resolveWorkdirInput(undefined)).toEqual({});
		expect(await resolveWorkdirInput(null)).toEqual({});
		expect(await resolveWorkdirInput("")).toEqual({});
		expect(await resolveWorkdirInput("   ")).toEqual({});
	});

	it("rejects non-string input", async () => {
		expect((await resolveWorkdirInput(42)).error).toContain("绝对路径");
	});

	it("rejects relative paths", async () => {
		expect((await resolveWorkdirInput("some/relative")).error).toContain("绝对路径");
	});

	it("rejects missing paths", async () => {
		const missing = join(freshDir(), "no-such-dir");
		expect((await resolveWorkdirInput(missing)).error).toContain("不存在");
	});

	it("rejects files that are not directories", async () => {
		const dir = freshDir();
		const file = join(dir, "f.txt");
		writeFileSync(file, "x");
		expect((await resolveWorkdirInput(file)).error).toContain("不是目录");
	});

	it("accepts an existing writable directory", async () => {
		const dir = freshDir();
		const resolved = await resolveWorkdirInput(dir);
		expect(resolved.error).toBeUndefined();
		expect(typeof resolved.dir).toBe("string");
	});

	it("lists read-only directories when only readability is required", async () => {
		const dir = freshDir();
		const resolved = await resolveWorkdirInput(dir, false);
		expect(resolved.error).toBeUndefined();
		expect(typeof resolved.dir).toBe("string");
	});

	it("leaves no probe files behind after validation", async () => {
		const { readdirSync } = await import("node:fs");
		const dir = freshDir();
		const resolved = await resolveWorkdirInput(dir);
		expect(resolved.error).toBeUndefined();
		expect(readdirSync(dir)).toEqual([]);
	});

	it.runIf(process.platform !== "win32")("rejects directories without write permission", async () => {
		const { chmodSync } = await import("node:fs");
		const dir = freshDir();
		chmodSync(dir, 0o555);
		try {
			expect((await resolveWorkdirInput(dir)).error).toContain("不可读写");
		} finally {
			chmodSync(dir, 0o755);
		}
	});
});

describe("listChildDirs", () => {
	it("rejects blank, missing and non-directory input", async () => {
		expect((await listChildDirs("")).error).toBeTruthy();
		expect((await listChildDirs(join(freshDir(), "nope"))).error).toContain("不存在");
		const dir = freshDir();
		const file = join(dir, "f.txt");
		writeFileSync(file, "x");
		expect((await listChildDirs(file)).error).toContain("不是目录");
	});

	it("lists only child directories, sorted, with a parent link", async () => {
		const { mkdirSync } = await import("node:fs");
		const dir = freshDir();
		mkdirSync(join(dir, "b"));
		mkdirSync(join(dir, "a"));
		writeFileSync(join(dir, "f.txt"), "x");
		const result = await listChildDirs(dir);
		expect(result.error).toBeUndefined();
		expect(result.listing?.entries.map((e) => e.name)).toEqual(["a", "b"]);
		expect(typeof result.listing?.parent).toBe("string");
	});
});

describe("checkCwdConfirm", () => {
	it("rejects a forged or missing nonce before touching any state", async () => {
		const dir = freshDir();
		const pending = { dir, until: Date.now() + 60_000 };
		expect(checkCwdConfirm(pending, dir, "wrong-nonce", "real-nonce", Date.now())?.status).toBe(403);
		expect(checkCwdConfirm(pending, dir, undefined, "real-nonce", Date.now())?.status).toBe(403);
	});

	it("rejects missing or expired pending state", async () => {
		const dir = freshDir();
		expect(checkCwdConfirm(undefined, dir, "n", "n", Date.now())?.status).toBe(400);
		const stale = { dir, until: Date.now() - 1 };
		expect(checkCwdConfirm(stale, dir, "n", "n", Date.now())?.status).toBe(400);
		const other = { dir: freshDir(), until: Date.now() + 60_000 };
		expect(checkCwdConfirm(other, dir, "n", "n", Date.now())?.status).toBe(400);
	});

	it("accepts a matching nonce with live pending state", async () => {
		const dir = freshDir();
		const pending = { dir, until: Date.now() + 60_000 };
		expect(checkCwdConfirm(pending, dir, "n", "n", Date.now())).toBeNull();
	});
});

describe("listDrives", () => {
	it("returns usable roots for the current platform", () => {
		const drives = listDrives();
		expect(drives.length).toBeGreaterThan(0);
		if (process.platform === "win32") {
			for (const drive of drives) expect(drive).toMatch(/^[A-Z]:\\$/);
		} else {
			expect(drives).toEqual(["/"]);
		}
	});
});
