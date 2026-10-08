import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApprovalGate, type ApprovalRequest } from "./permission.ts";

const dirs: string[] = [];

function freshDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "tju-perm-"));
	dirs.push(dir);
	return dir;
}

afterEach(() => {
	while (dirs.length) {
		const dir = dirs.pop();
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
});

function readCall(id: string, path: string) {
	return {
		toolCall: { type: "toolCall", id, name: "read", arguments: {} },
		args: { path },
	} as never;
}

describe("approval parent scope", () => {
	it("carries the immediate parent dir, null when the parent is a filesystem root", async () => {
		const work = freshDir();
		const seen: ApprovalRequest[] = [];
		const gate = createApprovalGate({
			workdir: work,
			ask: async (request) => {
				seen.push(request);
				return false;
			},
		});
		const outside = join(work, "..", "sib");
		await gate(readCall("t1", join(outside, "f.txt")));
		expect(seen).toHaveLength(1);
		expect(seen[0]?.parentDir).toBe(dirname(seen[0]?.scopeDir ?? ""));

		const root = parse(work).root;
		const seenRoot: ApprovalRequest[] = [];
		const rootGate = createApprovalGate({
			workdir: work,
			ask: async (request) => {
				seenRoot.push(request);
				return false;
			},
		});
		await rootGate(readCall("t2", join(root, "f.txt")));
		expect(seenRoot).toHaveLength(1);
		expect(seenRoot[0]?.parentDir).toBeNull();
	});

	it("grants the whole tree on a parent scope with a single ask", async () => {
		const work = freshDir();
		const tree = freshDir();
		mkdirSync(join(tree, "A"));
		mkdirSync(join(tree, "B"));
		writeFileSync(join(tree, "A", "f1.txt"), "1");
		writeFileSync(join(tree, "B", "f2.txt"), "2");
		let asks = 0;
		const gate = createApprovalGate({
			workdir: work,
			ask: async (request) => {
				asks++;
				expect(request.parentDir).toBe(dirname(request.scopeDir));
				return { scope: request.parentDir ?? request.scopeDir };
			},
		});
		expect(await gate(readCall("t1", join(tree, "A", "f1.txt")))).toBeUndefined();
		expect(await gate(readCall("t2", join(tree, "B", "f2.txt")))).toBeUndefined();
		expect(asks).toBe(1);
	});

	it("blocks a forged scope that does not cover the requested dir", async () => {
		const work = freshDir();
		const tree = freshDir();
		mkdirSync(join(tree, "A"));
		writeFileSync(join(tree, "A", "f1.txt"), "1");
		const unrelated = freshDir();
		const gate = createApprovalGate({
			workdir: work,
			ask: async () => ({ scope: unrelated }),
		});
		const blocked = await gate(readCall("t1", join(tree, "A", "f1.txt")));
		expect(blocked?.block).toBe(true);
	});

	it("accepts an object scope equal to the requested dir", async () => {
		const work = freshDir();
		const tree = freshDir();
		mkdirSync(join(tree, "A"));
		writeFileSync(join(tree, "A", "f1.txt"), "1");
		writeFileSync(join(tree, "A", "f2.txt"), "2");
		let asks = 0;
		const gate = createApprovalGate({
			workdir: work,
			ask: async (request) => {
				asks++;
				return { scope: request.scopeDir };
			},
		});
		expect(await gate(readCall("t1", join(tree, "A", "f1.txt")))).toBeUndefined();
		expect(await gate(readCall("t2", join(tree, "A", "f2.txt")))).toBeUndefined();
		expect(asks).toBe(1);
	});
});

function bashCall(id: string, command: string) {
	return {
		toolCall: { type: "toolCall", id, name: "bash", arguments: {} },
		args: { command },
	} as never;
}

describe("bash loopback guard", () => {
	it("prompts once for loopback URLs with no parent scope", async () => {
		const work = freshDir();
		const seen: ApprovalRequest[] = [];
		const gate = createApprovalGate({
			workdir: work,
			ask: async (request) => {
				seen.push(request);
				return "always" as const;
			},
		});
		expect(await gate(bashCall("t1", "curl http://127.0.0.1:9399/"))).toBeUndefined();
		expect(await gate(bashCall("t2", "curl http://127.0.0.1:9399/api/works"))).toBeUndefined();
		expect(seen).toHaveLength(1);
		expect(seen[0]?.scopeDir).toContain("127.0.0.1");
		expect(seen[0]?.parentDir).toBeNull();
	});

	it("stays silent for public URLs", async () => {
		const work = freshDir();
		let asks = 0;
		const gate = createApprovalGate({
			workdir: work,
			ask: async () => {
				asks++;
				return true;
			},
		});
		expect(await gate(bashCall("t1", "curl https://registry.npmjs.org/react"))).toBeUndefined();
		expect(asks).toBe(0);
	});

	it("skips bare ping but prompts for host with port or path", async () => {
		const work = freshDir();
		let asks = 0;
		const gate = createApprovalGate({
			workdir: work,
			ask: async () => {
				asks++;
				return true;
			},
		});
		expect(await gate(bashCall("t1", "ping 127.0.0.1"))).toBeUndefined();
		expect(asks).toBe(0);
		expect(await gate(bashCall("t2", "curl localhost:3000/api"))).toBeUndefined();
		expect(asks).toBe(1);
	});

	it("catches obfuscated loopback forms", async () => {
		const work = freshDir();
		const seen: string[] = [];
		const gate = createApprovalGate({
			workdir: work,
			ask: async (request) => {
				seen.push(request.scopeDir);
				return true;
			},
		});
		expect(await gate(bashCall("t1", "curl http://2130706433:9399/"))).toBeUndefined();
		expect(await gate(bashCall("t2", "curl http://[::1]:9399/"))).toBeUndefined();
		expect(await gate(bashCall("t3", "curl http://app.localhost:9399/"))).toBeUndefined();
		expect(seen).toHaveLength(3);
	});
});
