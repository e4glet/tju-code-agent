import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanPluginDirs } from "./server.ts";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempPlugins(): string {
	const root = mkdtempSync(join(tmpdir(), "tju-plugins-"));
	roots.push(root);
	const plugins = join(root, "plugins");
	mkdirSync(plugins, { recursive: true });
	return plugins;
}

function writePlugin(pluginsDir: string, name: string, files: Record<string, string>): void {
	for (const [rel, content] of Object.entries(files)) {
		const path = join(pluginsDir, name, rel);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	}
}

describe("scanPluginDirs", () => {
	it("resolves every plugin file against the plugin root, not process.cwd()", async () => {
		const pluginsDir = tempPlugins();
		writePlugin(pluginsDir, "pet", { "pet.js": "//entry", "assets/a.webp": "x" });

		const scan = await scanPluginDirs(pluginsDir);

		// The entry file must be served; a relative base lists nothing and made
		// every plugin request 404 (the allowlist was empty).
		expect(scan.allowed.has("pet/pet.js")).toBe(true);
		expect(scan.allowed.has("pet/assets/a.webp")).toBe(true);
		expect(scan.names).toEqual(["pet"]);
	});

	it("lists a plugin directory's files exactly once", async () => {
		const pluginsDir = tempPlugins();
		writePlugin(pluginsDir, "pet", { "pet.js": "//entry", "a.webp": "x", "b.webp": "y" });

		const scan = await scanPluginDirs(pluginsDir);

		expect(scan.names).toEqual(["pet"]);
		expect([...scan.allowed].sort()).toEqual(["pet/a.webp", "pet/b.webp", "pet/pet.js"]);
	});

	it("skips directories without the entry file and hidden directories", async () => {
		const pluginsDir = tempPlugins();
		writePlugin(pluginsDir, "pet", { "pet.js": "//entry" });
		writePlugin(pluginsDir, "empty", { "readme.txt": "no entry" });
		writePlugin(pluginsDir, ".hidden", { "pet.js": "//hidden" });

		const scan = await scanPluginDirs(pluginsDir);

		expect(scan.names).toEqual(["pet"]);
		expect(scan.allowed.has("empty/readme.txt")).toBe(false);
		expect(scan.allowed.has(".hidden/pet.js")).toBe(false);
	});

	it("returns an empty allowlist when the plugins directory is missing", async () => {
		const missing = join(tmpdir(), "tju-plugins-does-not-exist-" + Date.now());

		const scan = await scanPluginDirs(missing);

		expect(scan.names).toEqual([]);
		expect(scan.allowed.size).toBe(0);
	});
});
