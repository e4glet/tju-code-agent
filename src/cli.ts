import { PROVIDER_ENTRIES, resolveConfig, type CliFlags, type RunConfig } from "./config.ts";
import { applyLauncherConfig as applyLauncherConfigToStore, launcherFallbackId, loadProviderTable } from "./providers.ts";
import { DATA_DIR_ENV, resolveDataRoot } from "./data-root.ts";
import { runChat } from "./cli/chat.ts";
import { startGuiServer } from "./gui/server.ts";
import { takeRelaunchArgs } from "./update.ts";
import { APP_NAME, APP_VERSION, printBanner } from "./cli/banner.ts";

export function parseArgs(argv: string[]): { command: string; flags: CliFlags } {
	let command = "chat";
	const flags: CliFlags = {};
	const positional: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === undefined) continue;
		if (arg === "-h" || arg === "--help") {
			command = "help";
			continue;
		}
		if (arg === "-v" || arg === "--version") {
			command = "version";
			continue;
		}
		if (arg === "--") {
			positional.push(...argv.slice(i + 1));
			break;
		}
		if (arg.startsWith("--")) {
			const body = arg.slice(2);
			const eq = body.indexOf("=");
			if (eq !== -1) {
				flags[body.slice(0, eq)] = body.slice(eq + 1);
			} else {
				const next = argv[i + 1];
				if (next !== undefined && !next.startsWith("--")) {
					flags[body] = next;
					i++;
				} else {
					flags[body] = true;
				}
			}
		} else if (arg.startsWith("-")) {
			flags[arg.slice(1)] = true;
		} else {
			positional.push(arg);
		}
	}

	const commandArg = positional.shift();
	if (
		commandArg === "gui" ||
		commandArg === "chat" ||
		commandArg === "version" ||
		commandArg === "help"
	) {
		command = commandArg;
	} else if (commandArg) {
		command = "chat";
		positional.unshift(commandArg);
	}

	return { command, flags };
}

async function main(): Promise<void> {
	// A self-update relaunch hands the original flags over in the environment
	// rather than on the command line, which cannot carry them safely (see
	// `relaunch` in update.ts). Process.argv wins so explicit flags still work.
	const inherited = takeRelaunchArgs() ?? [];
	const args = process.argv.length > 2 ? process.argv.slice(2) : inherited;
	const { command, flags } = parseArgs(args);
	const dataDir = flags["data-dir"];
	if (typeof dataDir === "string" && dataDir) process.env[DATA_DIR_ENV] = dataDir;

	switch (command) {
		case "version":
			console.log(`${APP_NAME} v${APP_VERSION}`);
			return;
		case "help": {
			printHelp();
			return;
		}
		case "gui": {
			applyLauncherConfig(flags);
			const config = resolveConfig(flags);
			printWarnings(config);
			if (!config.apiKey) {
				console.error("[warn] No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY, or pass --api-key.");
			}
			await startGuiServer(config, flags);
			return;
		}
		case "chat":
		default: {
			applyLauncherConfig(flags);
			const config = resolveConfig(flags);
			printWarnings(config);
			if (!config.apiKey) {
				console.error("[warn] No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY, or pass --api-key.");
			}
			const cwd = process.env.TJU_CODE_CWD ?? process.cwd();
			printBanner(config.provider, config.model, cwd, resolveDataRoot());
			await runChat(config, cwd);
			return;
		}
	}
}

function applyLauncherConfig(flags: CliFlags): void {
	const baseUrl = typeof flags["base-url"] === "string" ? flags["base-url"] : "";
	const explicitProfile = flags.profile !== undefined;
	if (baseUrl && !explicitProfile) {
		const result = applyLauncherConfigToStore(PROVIDER_ENTRIES, {
			api: typeof flags.api === "string" ? flags.api : undefined,
			provider: typeof flags.provider === "string" ? flags.provider : undefined,
			baseUrl,
			model: typeof flags.model === "string" ? flags.model : undefined,
			apiKey: typeof flags["api-key"] === "string" ? flags["api-key"] : undefined,
		});
		if (result.status === "imported" && result.entryId) {
			console.error(`[info] 已从启动脚本导入接口「${result.entryId}」，可在 设置 → 接口 中修改或删除`);
		} else if (result.status === "refreshed" && result.entryId) {
			console.error(`[info] 启动脚本的接口地址已变化，已更新接口「${result.entryId}」`);
		} else if (result.status === "kept") {
			console.error(`[info] 启动脚本的接口地址已导入过，本次以本机配置为准（设置 → 接口）`);
			// Drop the launcher's own values so a stored entry edited in the UI wins.
			delete flags["base-url"];
			delete flags["api-key"];
			delete flags["model"];
			delete flags.api;
			delete flags.provider;
			flags.launcherProfileStale = true;
		} else if (result.status === "error") {
			console.error(`[warn] 启动脚本接口导入失败：${result.error}（本次按脚本参数运行）`);
		}
		if (result.entryId && loadProviderTable(PROVIDER_ENTRIES).table[result.entryId]) {
			flags.profile = result.entryId;
		}
		return;
	}
	if (!explicitProfile) {
		const fallback = launcherFallbackId();
		if (fallback && loadProviderTable(PROVIDER_ENTRIES).table[fallback]) {
			flags.profile = fallback;
			flags.launcherProfileStale = true;
		}
	}
}

function printWarnings(config: RunConfig): void {
	for (const warning of config.warnings ?? []) {
		console.error(`[warn] ${warning}`);
	}
}

function printHelp(): void {
	console.log(`${APP_NAME} v${APP_VERSION} - a self-extensible coding agent

Usage:
  tju-code [command] [flags]

Commands:
  chat            Interactive terminal session (default)
  gui             Browser UI at http://localhost:9399 (auto-opens)
  version         Print version and exit
  help            Show this help

Flags:
  --api <openai-completions|anthropic-messages>  Provider API kind
  --provider <id>       Provider id (defaults: openai / anthropic)
  --model <id>          Model id (defaults: gpt-4o-mini / claude-sonnet-4-5)
  --profile <name>      Preset providers: ${Object.keys(PROVIDER_ENTRIES).join(" | ")}
  --api-key <key>       API key (or <PROVIDER>_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)
  --base-url <url>      Custom API base URL
  --max-tokens <n>      Max output tokens
  --max-context-tokens <n>  Trim/drop transcript when input exceeds this (default 128000)
  --max-turns <n>           Max assistant turns per run before a forced summary (default 50)
  --no-thinking         Disable extended thinking (enabled by default)
  --port <n>            GUI port (default 9399)
  --no-open             Do not auto-open the browser (gui mode)
  --log-dir <path>      Directory for run event logs (default <data-dir>/logs)
  --log-retention <n>   Keep run logs for this many days (default 7)
  --data-dir <path>     Directory holding providers.json / secrets.json / works / logs
                        (default ~/.tju-code, or ./data next to dist when it exists)

Environment:
  OPENAI_API_KEY / OPENAI_BASE_URL / ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL
  DEEPSEEK_API_KEY / MOONSHOT_API_KEY / DASHSCOPE_API_KEY / OPENCODE_GO_API_KEY
`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});