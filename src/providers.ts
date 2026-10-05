import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { resolveDataRoot } from "./data-root.ts";
import type { ProviderEntry, ProviderModel } from "./config.ts";
import type { ApiKind } from "./core/types.ts";

export const PROVIDERS_SCHEMA_VERSION = 1;

export interface UserProviderEntry {
	id?: unknown;
	label?: unknown;
	api?: unknown;
	provider?: unknown;
	baseUrl?: unknown;
	defaultModel?: unknown;
	keyEnv?: unknown;
	baseUrlEnv?: unknown;
	modelEnv?: unknown;
	models?: unknown;
}

export interface ProviderTableResult {
	table: Record<string, ProviderEntry>;
	userIds: Set<string>;
	warnings: string[];
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function asApiKind(value: unknown): ApiKind | undefined {
	return value === "openai-completions" || value === "anthropic-messages" ? value : undefined;
}

function asModels(value: unknown): ProviderModel[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const out: ProviderModel[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") return undefined;
		const rec = item as Record<string, unknown>;
		if (typeof rec.id !== "string" || !rec.id) return undefined;
		const model: ProviderModel = { id: rec.id };
		if (typeof rec.deprecated === "boolean") model.deprecated = rec.deprecated;
		if (typeof rec.replacedBy === "string") model.replacedBy = rec.replacedBy;
		out.push(model);
	}
	return out;
}

function overlayEntry(base: ProviderEntry, raw: UserProviderEntry, warnings: string[]): ProviderEntry | null {
	const merged: ProviderEntry = { ...base, models: base.models?.slice() };
	if (raw.label !== undefined) {
		if (!isNonEmptyString(raw.label)) {
			warnings.push(`providers.json: entry "${base.id}" label 非法，已忽略该字段`);
		} else {
			merged.label = raw.label;
		}
	}
	if (raw.api !== undefined) {
		const api = asApiKind(raw.api);
		if (!api) {
			warnings.push(`providers.json: entry "${base.id}" api 非法，已忽略该字段`);
		} else {
			merged.api = api;
		}
	}
	if (raw.provider !== undefined) {
		if (!isNonEmptyString(raw.provider)) {
			warnings.push(`providers.json: entry "${base.id}" provider 非法，已忽略该字段`);
		} else {
			merged.provider = raw.provider;
		}
	}
	if (raw.baseUrl !== undefined) {
		if (!isNonEmptyString(raw.baseUrl)) {
			warnings.push(`providers.json: entry "${base.id}" baseUrl 非法，已忽略该字段`);
		} else {
			merged.baseUrl = raw.baseUrl;
		}
	}
	if (raw.defaultModel !== undefined) {
		if (!isNonEmptyString(raw.defaultModel)) {
			warnings.push(`providers.json: entry "${base.id}" defaultModel 非法，已忽略该字段`);
		} else {
			merged.defaultModel = raw.defaultModel;
		}
	}
	for (const [field, envKey] of [
		["keyEnv", "keyEnv"],
		["baseUrlEnv", "baseUrlEnv"],
		["modelEnv", "modelEnv"],
	] as const) {
		const value = raw[field];
		if (value === undefined) continue;
		if (!isNonEmptyString(value)) {
			warnings.push(`providers.json: entry "${base.id}" ${envKey} 非法，已忽略该字段`);
		} else {
			merged[envKey] = value;
		}
	}
	if (raw.models !== undefined) {
		const models = asModels(raw.models);
		if (!models) {
			warnings.push(`providers.json: entry "${base.id}" models 非法，已保留内置列表`);
		} else {
			merged.models = models;
		}
	}
	merged.source = "user";
	return merged;
}

export function mergeProviderEntries(
	builtin: Record<string, ProviderEntry>,
	rawEntries: unknown,
): { table: Record<string, ProviderEntry>; userIds: Set<string>; warnings: string[] } {
	const table: Record<string, ProviderEntry> = {};
	for (const [id, entry] of Object.entries(builtin)) {
		table[id] = { ...entry, models: entry.models?.slice(), source: "builtin" };
	}
	const userIds = new Set<string>();
	const warnings: string[] = [];
	if (!Array.isArray(rawEntries)) {
		if (rawEntries !== undefined) warnings.push("providers.json: entries 不是数组，已忽略用户配置");
		return { table, userIds, warnings };
	}
	for (const item of rawEntries) {
		if (!item || typeof item !== "object") {
			warnings.push("providers.json: 跳过一条非法条目（不是对象）");
			continue;
		}
		const raw = item as UserProviderEntry;
		if (!isNonEmptyString(raw.id)) {
			warnings.push("providers.json: 跳过一条缺少 id 的条目");
			continue;
		}
		const id = raw.id;
		const base = table[id];
		if (base) {
			const merged = overlayEntry(base, raw, warnings);
			if (merged) {
				table[id] = merged;
				userIds.add(id);
			}
			continue;
		}
		const api = asApiKind(raw.api);
		if (
			!api ||
			!isNonEmptyString(raw.provider) ||
			!isNonEmptyString(raw.baseUrl) ||
			!isNonEmptyString(raw.defaultModel)
		) {
			warnings.push(`providers.json: 新接口 "${id}" 缺少 api/provider/baseUrl/defaultModel，已跳过`);
			continue;
		}
		const entry: ProviderEntry = {
			id,
			label: isNonEmptyString(raw.label) ? raw.label : id,
			api,
			provider: raw.provider,
			baseUrl: raw.baseUrl,
			defaultModel: raw.defaultModel,
			source: "user",
		};
		if (isNonEmptyString(raw.keyEnv)) entry.keyEnv = raw.keyEnv;
		if (isNonEmptyString(raw.baseUrlEnv)) entry.baseUrlEnv = raw.baseUrlEnv;
		if (isNonEmptyString(raw.modelEnv)) entry.modelEnv = raw.modelEnv;
		const models = raw.models === undefined ? undefined : asModels(raw.models);
		if (raw.models !== undefined && !models) {
			warnings.push(`providers.json: 新接口 "${id}" models 非法，已跳过该字段`);
		} else if (models) {
			entry.models = models;
		}
		table[id] = entry;
		userIds.add(id);
	}
	return { table, userIds, warnings };
}

export function providersFile(dataRoot: string = resolveDataRoot()): string {
	return join(dataRoot, "providers.json");
}

/** Id of the first entry seeded from a launcher script (bat/sh). Kept pretty
 * on purpose: a single launcher keeps the readable `launcher` id, while a
 * second address gets `launcher-<hash>` (see launcherEntryIdFor). */
export const LAUNCHER_ENTRY_ID = "launcher";

/** Prefix of every entry seeded from a launcher script. */
export const LAUNCHER_ENTRY_PREFIX = "launcher-";

const LAUNCHER_DEFAULTS: Record<ApiKind, { provider: string; model: string }> = {
	"openai-completions": { provider: "openai", model: "gpt-4o-mini" },
	"anthropic-messages": { provider: "anthropic", model: "claude-sonnet-4-5" },
};

export interface LauncherConfig {
	api?: string;
	provider?: string;
	baseUrl?: string;
	model?: string;
	apiKey?: string;
}

export type LauncherApplyStatus = "imported" | "refreshed" | "kept" | "skipped" | "error";

export interface LauncherApplyResult {
	status: LauncherApplyStatus;
	entryId?: string;
	error?: string;
}

/** Records which launcher endpoint was already seeded. */
export function launcherMarkerFile(dataRoot: string = resolveDataRoot()): string {
	return join(dataRoot, "launcher-import.json");
}

function readSeedMap(dataRoot: string): {
	seeds: Record<string, string>;
	legacy: Record<string, string>;
	lastUsed?: string;
} {
	try {
		const parsed = JSON.parse(readFileSync(launcherMarkerFile(dataRoot), "utf-8")) as {
			baseUrl?: unknown;
			seeds?: unknown;
			lastUsed?: unknown;
		};
		const seeds: Record<string, string> = {};
		const legacy: Record<string, string> = {};
		if (parsed && typeof parsed === "object") {
			if (typeof parsed.baseUrl === "string" && parsed.baseUrl) {
				legacy[normalizeLauncherUrl(parsed.baseUrl)] = LAUNCHER_ENTRY_ID;
			}
			if (parsed.seeds && typeof parsed.seeds === "object") {
				for (const [k, v] of Object.entries(parsed.seeds as Record<string, unknown>)) {
					if (typeof v !== "string" || !v) continue;
					if (k.includes("\n")) seeds[k] = v;
					else legacy[normalizeLauncherUrl(k)] = v;
				}
			}
		}
		const lastUsed = typeof parsed?.lastUsed === "string" && parsed.lastUsed ? parsed.lastUsed : undefined;
		return { seeds, legacy, lastUsed };
	} catch {
		return { seeds: {}, legacy: {} };
	}
}

function writeSeedMap(dataRoot: string, seeds: Record<string, string>, lastUsed?: string): void {
	const path = launcherMarkerFile(dataRoot);
	mkdirSync(dirname(path), { recursive: true });
	const body: { schemaVersion: number; seeds: Record<string, string>; lastUsed?: string } = {
		schemaVersion: 1,
		seeds,
	};
	if (lastUsed) body.lastUsed = lastUsed;
	writeFileSync(path, JSON.stringify(body, null, 2) + "\n", "utf-8");
}

function normalizeLauncherUrl(baseUrl: string): string {
	return baseUrl.trim().toLowerCase().replace(/\/+$/, "");
}

function launcherSeedKey(normalizedUrl: string, model: string): string {
	return `${normalizedUrl}\n${model.trim().toLowerCase()}`;
}

function isLauncherFamilyId(id: unknown): boolean {
	return id === LAUNCHER_ENTRY_ID || (typeof id === "string" && id.startsWith(LAUNCHER_ENTRY_PREFIX));
}

function entryBaseUrl(entry: UserProviderEntry): string | undefined {
	return typeof entry.baseUrl === "string" ? normalizeLauncherUrl(entry.baseUrl) : undefined;
}

function entryModel(entry: UserProviderEntry): string | undefined {
	return typeof entry.defaultModel === "string" && entry.defaultModel.trim()
		? entry.defaultModel.trim().toLowerCase()
		: undefined;
}

function launcherLabel(baseUrl: string, model: string | undefined): string {
	const m = model?.trim();
	if (m) return `启动脚本·${m}`;
	try {
		const host = new URL(baseUrl).hostname;
		if (host) return `启动脚本·${host}`;
	} catch {
		// fall through to the bare label
	}
	return "启动脚本";
}

function launcherEntryIdFor(
	seedKey: string,
	normalizedUrl: string,
	model: string,
	seeds: Record<string, string>,
	legacy: Record<string, string>,
	entries: UserProviderEntry[],
): string {
	const known = seeds[seedKey];
	if (known) return known;
	const legacyId = legacy[normalizedUrl];
	if (legacyId) {
		const target = entries.find((e) => e && typeof e === "object" && (e as UserProviderEntry).id === legacyId) as
			| UserProviderEntry
			| undefined;
		if (target && entryBaseUrl(target) === normalizedUrl && entryModel(target) === model) return legacyId;
	}
	const match = entries.find(
		(e) =>
			e &&
			typeof e === "object" &&
			isLauncherFamilyId((e as UserProviderEntry).id) &&
			entryBaseUrl(e as UserProviderEntry) === normalizedUrl &&
			entryModel(e as UserProviderEntry) === model,
	) as UserProviderEntry | undefined;
	if (match && typeof match.id === "string") return match.id;
	if (
		Object.keys(seeds).length === 0 &&
		Object.keys(legacy).length === 0 &&
		!entries.some((e) => e && typeof e === "object" && isLauncherFamilyId((e as UserProviderEntry).id))
	) {
		return LAUNCHER_ENTRY_ID;
	}
	let suffix = createHash("sha256").update(seedKey).digest("hex").slice(0, 8);
	let id = `${LAUNCHER_ENTRY_PREFIX}${suffix}`;
	for (let extra = 10; entries.some((e) => e && typeof e === "object" && (e as UserProviderEntry).id === id); extra += 2) {
		suffix = createHash("sha256").update(seedKey).digest("hex").slice(0, extra);
		id = `${LAUNCHER_ENTRY_PREFIX}${suffix}`;
	}
	return id;
}

/** Entry to select when the launcher carries no address: the legacy entry,
 * otherwise the most recently used seeded entry, if it still exists. */
export function launcherFallbackId(dataRoot: string = resolveDataRoot()): string | undefined {
	const { seeds, legacy, lastUsed } = readSeedMap(dataRoot);
	const current = readRawUserEntries(dataRoot);
	if ("error" in current) return undefined;
	const ids = new Set(
		current.entries
			.filter((e) => e && typeof e === "object" && typeof (e as UserProviderEntry).id === "string")
			.map((e) => (e as UserProviderEntry).id as string),
	);
	if (ids.has(LAUNCHER_ENTRY_ID)) return LAUNCHER_ENTRY_ID;
	if (lastUsed && ids.has(lastUsed)) return lastUsed;
	for (const id of [...Object.values(seeds), ...Object.values(legacy)]) {
		if (ids.has(id)) return id;
	}
	return undefined;
}

/**
 * Seed the launcher script's endpoint into the local interface table.
 *
 * Seeds accumulate per address + model: each distinct base URL / model pair
 * gets its own entry (the first one keeps the readable `launcher` id, later
 * ones get `launcher-<hash>`), so switching between launcher scripts never
 * drops the previous configuration. Per pair the seed is one-time, not a
 * standing override: while a launcher keeps pointing at the same address and
 * model, the stored entry — including every edit made in the settings UI —
 * wins. A launcher without a base URL carries nothing to seed and is
 * reported as skipped.
 */
export function applyLauncherConfig(
	builtin: Record<string, ProviderEntry>,
	input: LauncherConfig,
	dataRoot: string = resolveDataRoot(),
): LauncherApplyResult {
	const baseUrl = input.baseUrl?.trim();
	if (!baseUrl) return { status: "skipped" };
	const current = readRawUserEntries(dataRoot);
	if ("error" in current) return { status: "error", error: current.error };
	const api = asApiKind(input.api) ?? "openai-completions";
	const defaults = LAUNCHER_DEFAULTS[api];
	const effectiveModel = input.model?.trim() || defaults.model;
	const normalizedUrl = normalizeLauncherUrl(baseUrl);
	const seedKey = launcherSeedKey(normalizedUrl, effectiveModel);
	const { seeds, legacy } = readSeedMap(dataRoot);
	const entryId = launcherEntryIdFor(seedKey, normalizedUrl, effectiveModel.toLowerCase(), seeds, legacy, current.entries);
	const existing = current.entries.some(
		(entry) => entry && typeof entry === "object" && (entry as UserProviderEntry).id === entryId,
	);
	if (existing) {
		try {
			writeSeedMap(dataRoot, { ...seeds, [seedKey]: entryId }, entryId);
		} catch {
			// best effort: without the marker we re-evaluate on the next launch
		}
		return { status: "kept", entryId };
	}
	const entry: UserProviderEntry = {
		id: entryId,
		label: entryId === LAUNCHER_ENTRY_ID ? "启动脚本" : launcherLabel(baseUrl, input.model),
		api,
		provider: input.provider?.trim() || defaults.provider,
		baseUrl,
		defaultModel: effectiveModel,
	};
	const written = upsertUserEntry(builtin, entry, dataRoot);
	if ("error" in written) return { status: "error", error: written.error };
	const key = input.apiKey?.trim();
	if (key) {
		try {
			writeSecret(entryId, key, dataRoot);
		} catch (err) {
			return {
				status: "error",
				error: `接口已写入，但 key 保存失败：${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}
	try {
		writeSeedMap(dataRoot, { ...seeds, [seedKey]: entryId }, entryId);
	} catch {
		// best effort: without the marker we re-seed on the next launch
	}
	return { status: "imported", entryId };
}

export function readRawUserEntries(dataRoot: string = resolveDataRoot()): { entries: UserProviderEntry[] } | { error: string } {
	let raw: string;
	try {
		raw = readFileSync(providersFile(dataRoot), "utf-8");
	} catch {
		return { entries: [] };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { error: "providers.json 解析失败，请修复或删除后重试" };
	}
	if (!parsed || typeof parsed !== "object") return { error: "providers.json 格式非法" };
	const file = parsed as { schemaVersion?: unknown; entries?: unknown };
	if (file.schemaVersion !== undefined && file.schemaVersion !== PROVIDERS_SCHEMA_VERSION) {
		return { error: "providers.json 版本不受支持" };
	}
	if (file.entries === undefined) return { entries: [] };
	if (!Array.isArray(file.entries)) return { error: "providers.json entries 不是数组" };
	return { entries: file.entries as UserProviderEntry[] };
}

export function writeRawUserEntries(dataRoot: string, entries: UserProviderEntry[]): void {
	const path = providersFile(dataRoot);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify({ schemaVersion: PROVIDERS_SCHEMA_VERSION, entries }, null, 2) + "\n", "utf-8");
}

export function upsertUserEntry(
	builtin: Record<string, ProviderEntry>,
	raw: UserProviderEntry,
	dataRoot: string = resolveDataRoot(),
): { ok: true } | { error: string } {
	if (!raw || typeof raw !== "object" || !isNonEmptyString(raw.id)) return { error: "接口 id 不能为空" };
	const current = readRawUserEntries(dataRoot);
	if ("error" in current) return current;
	const next = current.entries.filter((e) => !(e && typeof e === "object" && (e as UserProviderEntry).id === raw.id));
	next.push(raw);
	const merged = mergeProviderEntries(builtin, next);
	if (!merged.table[raw.id as string]) return { error: "条目校验失败（api/provider/baseUrl/defaultModel 必填且合法）" };
	try {
		writeRawUserEntries(dataRoot, next);
	} catch (err) {
		return { error: `写入失败：${err instanceof Error ? err.message : String(err)}` };
	}
	return { ok: true };
}

export function deleteUserEntry(id: string, dataRoot: string = resolveDataRoot()): { ok: true } | { error: string } {
	const current = readRawUserEntries(dataRoot);
	if ("error" in current) return current;
	if (!current.entries.some((e) => e && typeof e === "object" && (e as UserProviderEntry).id === id)) {
		return { error: "用户配置里没有该接口（内置接口不可删除）" };
	}
	try {
		writeRawUserEntries(
			dataRoot,
			current.entries.filter((e) => !(e && typeof e === "object" && (e as UserProviderEntry).id === id)),
		);
	} catch (err) {
		return { error: `写入失败：${err instanceof Error ? err.message : String(err)}` };
	}
	return { ok: true };
}

export function secretsFile(dataRoot: string = resolveDataRoot()): string {
	return join(dataRoot, "secrets.json");
}

export function loadProviderTable(
	builtin: Record<string, ProviderEntry>,
	dataRoot: string = resolveDataRoot(),
): ProviderTableResult {
	const path = providersFile(dataRoot);
	let raw: string;
	try {
		raw = readFileSync(path, "utf-8");
	} catch {
		return { ...mergeProviderEntries(builtin, undefined), warnings: [] };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {
			table: mergeProviderEntries(builtin, undefined).table,
			userIds: new Set(),
			warnings: ["providers.json 解析失败，已使用内置接口配置"],
		};
	}
	if (!parsed || typeof parsed !== "object") {
		return {
			table: mergeProviderEntries(builtin, undefined).table,
			userIds: new Set(),
			warnings: ["providers.json 格式非法，已使用内置接口配置"],
		};
	}
	const file = parsed as { schemaVersion?: unknown; entries?: unknown };
	if (file.schemaVersion !== undefined && file.schemaVersion !== PROVIDERS_SCHEMA_VERSION) {
		return {
			table: mergeProviderEntries(builtin, undefined).table,
			userIds: new Set(),
			warnings: [`providers.json 版本不受支持，已使用内置接口配置`],
		};
	}
	return mergeProviderEntries(builtin, file.entries);
}

export function readSecrets(dataRoot: string = resolveDataRoot()): Record<string, string> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(secretsFile(dataRoot), "utf-8"));
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== "object") return {};
	const keys = (parsed as { keys?: unknown }).keys;
	if (!keys || typeof keys !== "object") return {};
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(keys as Record<string, unknown>)) {
		if (typeof v === "string" && v) out[k] = v;
	}
	return out;
}

export function writeSecret(entryId: string, key: string | null, dataRoot: string = resolveDataRoot()): void {
	const path = secretsFile(dataRoot);
	mkdirSync(dirname(path), { recursive: true });
	const keys = readSecrets(dataRoot);
	if (key) {
		keys[entryId] = key;
	} else {
		delete keys[entryId];
	}
	writeFileSync(path, JSON.stringify({ version: 1, keys }, null, 2) + "\n", "utf-8");
	try {
		chmodSync(path, 0o600);
	} catch {
		// best effort: Windows ACLs ignore POSIX modes
	}
}

export function resolveEntryKey(
	entry: ProviderEntry,
	env: NodeJS.ProcessEnv,
	secrets: Record<string, string>,
): string | undefined {
	if (entry.keyEnv) {
		const fromEnv = env[entry.keyEnv];
		if (fromEnv) return fromEnv;
	}
	const stored = secrets[entry.id];
	if (stored) return stored;
	const generic = entry.api === "anthropic-messages" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
	return generic || undefined;
}

export interface ResolvedInterface {
	model: {
		id: string;
		api: ApiKind;
		provider: string;
		baseUrl?: string;
	};
	apiKey?: string;
	entryId: string;
}

export function resolveInterface(
	table: Record<string, ProviderEntry>,
	entryId: string,
	modelId: string | undefined,
	env: NodeJS.ProcessEnv,
	secrets: Record<string, string>,
): ResolvedInterface | { error: string } {
	const entry = table[entryId];
	if (!entry) return { error: `接口不存在：${entryId}` };
	const id = modelId && modelId.trim() ? modelId.trim() : entry.defaultModel;
	return {
		model: { id, api: entry.api, provider: entry.provider, baseUrl: entry.baseUrl },
		apiKey: resolveEntryKey(entry, env, secrets),
		entryId: entry.id,
	};
}

const NON_CHAT_MODEL = /embed|tts|whisper|rerank|image|dall|transcri|moderation|audio|vision|ocr/i;

export async function probeModels(
	entry: { api: ApiKind; baseUrl: string },
	apiKey: string | undefined,
): Promise<{ models?: string[]; error?: string }> {
	if (!apiKey) return { error: "缺少 API key，无法测试连接" };
	const base = entry.baseUrl.replace(/\/+$/, "");
	const headers: Record<string, string> =
		entry.api === "anthropic-messages"
			? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
			: { authorization: `Bearer ${apiKey}` };
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), 15000);
	try {
		const res = await fetch(`${base}/models`, { headers, signal: ctl.signal });
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			return { error: `HTTP ${res.status}：${text.slice(0, 200)}` };
		}
		const data = (await res.json().catch(() => null)) as { data?: Array<{ id?: unknown }> } | null;
		const ids = Array.isArray(data?.data)
			? (data?.data ?? [])
					.map((m) => (typeof m?.id === "string" ? m.id : ""))
					.filter((id) => id && !NON_CHAT_MODEL.test(id))
			: [];
		return { models: ids };
	} catch (err) {
		return { error: `连接失败：${err instanceof Error ? err.message : String(err)}` };
	} finally {
		clearTimeout(timer);
	}
}
