import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

/** Overrides the data directory (providers.json, secrets.json, works, logs). */
export const DATA_DIR_ENV = "TJU_CODE_HOME";

export function defaultDataRoot(): string {
	return join(homedir(), ".tju-code");
}

/**
 * A `data/` directory next to `dist/` marks a portable install: copy the whole
 * folder to another machine and the configuration, work items and logs come
 * along. Only an existing directory counts, so a normal install is unaffected —
 * nothing is ever created implicitly.
 *
 * Self-update is safe by construction: `swapToRelease` renames `dist/` only, so
 * a release swap can never touch this directory.
 */
export function portableDataRoot(argv1: string | undefined = process.argv[1]): string | undefined {
	if (!argv1) return undefined;
	const distDir = dirname(resolve(process.cwd(), argv1));
	if (basename(distDir).toLowerCase() !== "dist") return undefined;
	const candidate = join(dirname(distDir), "data");
	return existsSync(candidate) ? candidate : undefined;
}

export type DataRootSource = "env" | "portable" | "default";

export interface DataRootInfo {
	path: string;
	source: DataRootSource;
}

/** Explicit override wins, then the portable marker, then the per-user default. */
export function describeDataRoot(env: NodeJS.ProcessEnv = process.env, argv1?: string): DataRootInfo {
	const explicit = env[DATA_DIR_ENV];
	if (explicit) return { path: resolve(explicit), source: "env" };
	const portable = portableDataRoot(argv1);
	if (portable) return { path: portable, source: "portable" };
	return { path: defaultDataRoot(), source: "default" };
}

export function resolveDataRoot(env: NodeJS.ProcessEnv = process.env, argv1: string | undefined = process.argv[1]): string {
	return describeDataRoot(env, argv1).path;
}
