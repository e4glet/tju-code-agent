import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DATA_DIR_ENV, defaultDataRoot, describeDataRoot, portableDataRoot, resolveDataRoot } from "./data-root.ts";

const created: string[] = [];

function freshDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "tju-data-root-"));
	created.push(dir);
	return dir;
}

afterEach(() => {
	while (created.length > 0) {
		const dir = created.pop();
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
});

describe("data root resolution", () => {
	it("falls back to the per-user directory", () => {
		expect(defaultDataRoot()).toBe(join(homedir(), ".tju-code"));
		const root = freshDir();
		mkdirSync(join(root, "dist"), { recursive: true });
		const info = describeDataRoot({}, join(root, "dist", "cli.js"));
		expect(info.path).toBe(defaultDataRoot());
		expect(info.source).toBe("default");
	});

	it("lets TJU_CODE_HOME win over a portable marker", () => {
		const override = freshDir();
		const root = freshDir();
		mkdirSync(join(root, "dist"), { recursive: true });
		mkdirSync(join(root, "data"), { recursive: true });
		const info = describeDataRoot({ [DATA_DIR_ENV]: override }, join(root, "dist", "cli.js"));
		expect(info.path).toBe(override);
		expect(info.source).toBe("env");
	});

	it("treats an existing ./data next to dist as a portable install", () => {
		const root = freshDir();
		mkdirSync(join(root, "dist"), { recursive: true });
		mkdirSync(join(root, "data"), { recursive: true });
		const argv1 = join(root, "dist", "cli.js");
		expect(portableDataRoot(argv1)).toBe(join(root, "data"));
		expect(resolveDataRoot({}, argv1)).toBe(join(root, "data"));
		expect(describeDataRoot({}, argv1).source).toBe("portable");
	});

	it("never creates the data directory implicitly", () => {
		const root = freshDir();
		mkdirSync(join(root, "dist"), { recursive: true });
		const argv1 = join(root, "dist", "cli.js");
		expect(portableDataRoot(argv1)).toBeUndefined();
		expect(resolveDataRoot({}, argv1)).toBe(defaultDataRoot());
	});

	it("only honours a dist directory as the install root", () => {
		const root = freshDir();
		mkdirSync(join(root, "src"), { recursive: true });
		mkdirSync(join(root, "data"), { recursive: true });
		expect(portableDataRoot(join(root, "src", "cli.ts"))).toBeUndefined();
		expect(resolveDataRoot({}, join(root, "src", "cli.ts"))).toBe(defaultDataRoot());
	});

	it("survives a missing entry script", () => {
		expect(portableDataRoot(undefined)).toBeUndefined();
	});
});
