import { defineConfig } from "tsup";
import { copyFile, stat } from "node:fs/promises";
import { join } from "node:path";

const ASSET_FILES = ["favicon.ico", "logo-2026.png"];

const copyAssets = async () => {
	for (const name of ASSET_FILES) {
		const src = join(process.cwd(), name);
		const dest = join(process.cwd(), "dist", name);
		try {
			await stat(src);
			await copyFile(src, dest);
			console.log(`[assets] copied ${name} -> dist/${name}`);
		} catch {
			console.warn(`[assets] ${name} not found in project root, skipped`);
		}
	}
};

export default defineConfig({
	entry: ["src/cli.ts", "src/index.ts"],
	format: ["esm"],
	target: "node20",
	outDir: "dist",
	clean: true,
	dts: true,
	sourcemap: true,
	splitting: false,
	noExternal: ["zod", "zod-to-json-schema"],
	banner: { js: "#!/usr/bin/env node" },
	onSuccess: copyAssets,
});
