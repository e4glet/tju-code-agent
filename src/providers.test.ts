import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PROVIDER_ENTRIES, resolveConfig } from "./config.ts";
import {
	applyLauncherConfig,
	deleteUserEntry,
	LAUNCHER_ENTRY_ID,
	LAUNCHER_ENTRY_PREFIX,
	launcherMarkerFile,
	loadProviderTable,
	providersFile,
	readSecrets,
	secretsFile,
	upsertUserEntry,
} from "./providers.ts";

const homes: string[] = [];

function freshHome(): string {
	const home = mkdtempSync(join(tmpdir(), "tju-providers-"));
	homes.push(home);
	return home;
}

afterEach(() => {
	while (homes.length) {
		const home = homes.pop();
		if (home) rmSync(home, { recursive: true, force: true });
	}
});

const LAUNCHER_FLAGS = {
	api: "openai-completions",
	baseUrl: "https://launcher.example/v1",
	model: "launcher-model",
	apiKey: "launcher-key",
};

describe("applyLauncherConfig", () => {
	it("seeds a named entry plus its key from the launcher flags", () => {
		const home = freshHome();
		const result = applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		expect(result).toMatchObject({ status: "imported", entryId: LAUNCHER_ENTRY_ID });

		const loaded = loadProviderTable(PROVIDER_ENTRIES, home);
		const entry = loaded.table[LAUNCHER_ENTRY_ID];
		expect(entry).toMatchObject({
			api: "openai-completions",
			baseUrl: "https://launcher.example/v1",
			defaultModel: "launcher-model",
			source: "user",
		});
		expect(loaded.userIds.has(LAUNCHER_ENTRY_ID)).toBe(true);
		expect(readSecrets(home)[LAUNCHER_ENTRY_ID]).toBe("launcher-key");
	});

	it("keeps the key out of providers.json", () => {
		const home = freshHome();
		applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		expect(readFileSync(providersFile(home), "utf-8")).not.toContain("launcher-key");
		expect(readFileSync(secretsFile(home), "utf-8")).toContain("launcher-key");
	});

	it("records the seeded address and model so later runs can tell scripts apart", () => {
		const home = freshHome();
		const result = applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		expect(result.status).toBe("imported");
		const marker = JSON.parse(readFileSync(launcherMarkerFile(home), "utf-8"));
		expect(marker.schemaVersion).toBe(1);
		expect(marker.seeds["https://launcher.example/v1\nlauncher-model"]).toBe(result.entryId);
	});

	it("seeds a separate entry for the same address with a different model", () => {
		const home = freshHome();
		const first = applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		const second = applyLauncherConfig(PROVIDER_ENTRIES, { ...LAUNCHER_FLAGS, model: "other-model" }, home);
		expect(second.status).toBe("imported");
		expect(second.entryId).not.toBe(first.entryId);
		const table = loadProviderTable(PROVIDER_ENTRIES, home).table;
		expect(table[first.entryId as string]?.defaultModel).toBe("launcher-model");
		expect(table[second.entryId as string]?.defaultModel).toBe("other-model");
		expect(applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home)).toMatchObject({
			status: "kept",
			entryId: first.entryId,
		});
		expect(applyLauncherConfig(PROVIDER_ENTRIES, { ...LAUNCHER_FLAGS, model: "other-model" }, home)).toMatchObject(
			{ status: "kept", entryId: second.entryId },
		);
	});

	it("adopts a legacy url-only seed when the address and model match", () => {
		const home = freshHome();
		applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		const marker = JSON.parse(readFileSync(launcherMarkerFile(home), "utf-8"));
		writeFileSync(
			launcherMarkerFile(home),
			JSON.stringify({ schemaVersion: 1, baseUrl: "https://launcher.example/v1" }),
			"utf-8",
		);
		expect(marker.seeds).toBeDefined();
		expect(applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home)).toMatchObject({
			status: "kept",
			entryId: LAUNCHER_ENTRY_ID,
		});
	});

	it("is a one-time seed: relaunching the same launcher keeps the stored entry", () => {
		const home = freshHome();
		applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		const again = applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		expect(again.status).toBe("kept");
		const entry = loadProviderTable(PROVIDER_ENTRIES, home).table[LAUNCHER_ENTRY_ID];
		expect(entry?.baseUrl).toBe("https://launcher.example/v1");
		expect(entry?.defaultModel).toBe("launcher-model");
	});

	it("accumulates a new entry when the launcher base url changes", () => {
		const home = freshHome();
		const first = applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		const moved = applyLauncherConfig(
			PROVIDER_ENTRIES,
			{ baseUrl: "https://other.example/v1", model: "other-model", apiKey: "other-key" },
			home,
		);
		expect(moved.status).toBe("imported");
		expect(moved.entryId).not.toBe(first.entryId);
		expect(moved.entryId?.startsWith(LAUNCHER_ENTRY_PREFIX)).toBe(true);
		const table = loadProviderTable(PROVIDER_ENTRIES, home).table;
		expect(table[first.entryId as string]?.baseUrl).toBe("https://launcher.example/v1");
		expect(table[moved.entryId as string]).toMatchObject({
			baseUrl: "https://other.example/v1",
			defaultModel: "other-model",
		});
		expect(readSecrets(home)[moved.entryId as string]).toBe("other-key");
		expect(readSecrets(home)[first.entryId as string]).toBe("launcher-key");
	});

	it("selects the matching entry when switching between launcher addresses", () => {
		const home = freshHome();
		const first = applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		const second = applyLauncherConfig(PROVIDER_ENTRIES, { baseUrl: "https://other.example/v1" }, home);
		expect(applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home)).toMatchObject({
			status: "kept",
			entryId: first.entryId,
		});
		expect(
			applyLauncherConfig(PROVIDER_ENTRIES, { baseUrl: "https://other.example/v1" }, home),
		).toMatchObject({ status: "kept", entryId: second.entryId });
		expect(Object.keys(loadProviderTable(PROVIDER_ENTRIES, home).table)).toContain(first.entryId as string);
	});

	it("never overwrites edits made in the settings UI", () => {
		const home = freshHome();
		applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		const edited = upsertUserEntry(
			PROVIDER_ENTRIES,
			{
				id: LAUNCHER_ENTRY_ID,
				label: "改过的",
				api: "anthropic-messages",
				provider: "anthropic",
				baseUrl: "https://edited.example",
				defaultModel: "claude-sonnet-4-5",
			},
			home,
		);
		expect(edited).toMatchObject({ ok: true });
		expect(applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home).status).toBe("kept");
		const entry = loadProviderTable(PROVIDER_ENTRIES, home).table[LAUNCHER_ENTRY_ID];
		expect(entry?.label).toBe("改过的");
		expect(entry?.api).toBe("anthropic-messages");
		expect(entry?.baseUrl).toBe("https://edited.example");
	});

	it("re-seeds after the entry was deleted while the launcher still passes a base url", () => {
		const home = freshHome();
		applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		expect(deleteUserEntry(LAUNCHER_ENTRY_ID, home)).toMatchObject({ ok: true });
		expect(applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home).status).toBe("imported");
		expect(loadProviderTable(PROVIDER_ENTRIES, home).table[LAUNCHER_ENTRY_ID]?.baseUrl).toBe("https://launcher.example/v1");
	});

	it("leaves a hand-made launcher entry alone and seeds the new address beside it", () => {
		const home = freshHome();
		upsertUserEntry(
			PROVIDER_ENTRIES,
			{
				id: LAUNCHER_ENTRY_ID,
				label: "手写的",
				api: "openai-completions",
				provider: "openai",
				baseUrl: "https://handmade.example/v1",
				defaultModel: "handmade",
			},
			home,
		);
		const result = applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		expect(result.status).toBe("imported");
		const table = loadProviderTable(PROVIDER_ENTRIES, home).table;
		expect(table[LAUNCHER_ENTRY_ID]).toMatchObject({ label: "手写的", baseUrl: "https://handmade.example/v1" });
		expect(table[result.entryId as string]?.baseUrl).toBe("https://launcher.example/v1");
	});

	it("skips a launcher without a base url and writes nothing", () => {
		const home = freshHome();
		expect(applyLauncherConfig(PROVIDER_ENTRIES, { apiKey: "orphan-key" }, home).status).toBe("skipped");
		expect(loadProviderTable(PROVIDER_ENTRIES, home).userIds.size).toBe(0);
		expect(readSecrets(home)).toEqual({});
	});

	it("defaults the api kind and model when the launcher only sets a base url", () => {
		const home = freshHome();
		applyLauncherConfig(PROVIDER_ENTRIES, { baseUrl: "https://bare.example/v1" }, home);
		const entry = loadProviderTable(PROVIDER_ENTRIES, home).table[LAUNCHER_ENTRY_ID];
		expect(entry).toMatchObject({ api: "openai-completions", provider: "openai", defaultModel: "gpt-4o-mini" });
	});

	it("keeps the anthropic defaults for an anthropic launcher", () => {
		const home = freshHome();
		applyLauncherConfig(PROVIDER_ENTRIES, { api: "anthropic-messages", baseUrl: "https://anthropic.example" }, home);
		const entry = loadProviderTable(PROVIDER_ENTRIES, home).table[LAUNCHER_ENTRY_ID];
		expect(entry).toMatchObject({ api: "anthropic-messages", provider: "anthropic", defaultModel: "claude-sonnet-4-5" });
	});

	it("reports a corrupt providers.json instead of throwing", () => {
		const home = freshHome();
		applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		writeFileSync(providersFile(home), "{ not json", "utf-8");
		const result = applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		expect(result.status).toBe("error");
		expect(result.error).toContain("providers.json");
	});

	it("makes an unconfigured launcher usable through the seeded entry", () => {
		const home = freshHome();
		applyLauncherConfig(PROVIDER_ENTRIES, LAUNCHER_FLAGS, home);
		const loaded = loadProviderTable(PROVIDER_ENTRIES, home);
		const config = resolveConfig({ profile: LAUNCHER_ENTRY_ID }, {}, loaded.table, readSecrets(home));
		expect(config.providerEntryId).toBe(LAUNCHER_ENTRY_ID);
		expect(config.baseUrl).toBe("https://launcher.example/v1");
		expect(config.model).toBe("launcher-model");
		expect(config.apiKey).toBe("launcher-key");
		expect(config.warnings).toBeUndefined();
	});

	it("refuses to persist a user entry that fails validation", () => {
		const home = freshHome();
		const result = upsertUserEntry(PROVIDER_ENTRIES, { id: "broken" }, home);
		expect("error" in result && result.error).toContain("校验失败");
		expect(loadProviderTable(PROVIDER_ENTRIES, home).userIds.size).toBe(0);
	});

	it("skips a broken entry written by hand and warns about it", () => {
		const home = freshHome();
		mkdirSync(dirname(providersFile(home)), { recursive: true });
		writeFileSync(providersFile(home), JSON.stringify({ schemaVersion: 1, entries: [{ id: "broken" }] }), "utf-8");
		const loaded = loadProviderTable(PROVIDER_ENTRIES, home);
		expect(loaded.table.broken).toBeUndefined();
		expect(loaded.warnings.some((w) => w.includes("broken"))).toBe(true);
	});
});
