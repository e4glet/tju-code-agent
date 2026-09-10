import { resolveConfig, type CliFlags, type RunConfig } from "./config.ts";
import { runChat } from "./cli/chat.ts";
import { startGuiServer } from "./gui/server.ts";
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
	const args = process.argv.slice(2);
	const { command, flags } = parseArgs(args);

	switch (command) {
		case "version":
			console.log(`${APP_NAME} v${APP_VERSION}`);
			return;
		case "help": {
			printHelp();
			return;
		}
		case "gui": {
			const config = resolveConfig(flags);
			if (!config.apiKey) {
				console.error("[warn] No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY, or pass --api-key.");
			}
			await startGuiServer(config, flags);
			return;
		}
		case "chat":
		default: {
			const config = resolveConfig(flags);
			if (!config.apiKey) {
				console.error("[warn] No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY, or pass --api-key.");
			}
			const cwd = process.env.TJU_CODE_CWD ?? process.cwd();
			printBanner(config.provider, config.model, cwd);
			await runChat(config, cwd);
			return;
		}
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
  --profile <name>      Preset providers: deepseek | kimi | qwen | glm | amd
  --api-key <key>       API key (or <PROVIDER>_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)
  --base-url <url>      Custom API base URL
  --max-tokens <n>      Max output tokens
  --max-context-tokens <n>  Trim/drop transcript when input exceeds this (default 128000)
  --max-turns <n>           Max assistant turns per run before a forced summary (default 50)
  --no-thinking         Disable extended thinking (enabled by default)
  --port <n>            GUI port (default 9399)
  --no-open             Do not auto-open the browser (gui mode)
  --log-dir <path>      Directory for run event logs (default ~/.tju-code/logs)
  --log-retention <n>   Keep run logs for this many days (default 7)

Environment:
  OPENAI_API_KEY / OPENAI_BASE_URL / ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL
  DEEPSEEK_API_KEY / MOONSHOT_API_KEY / DASHSCOPE_API_KEY / ZHIPU_API_KEY
  AMD: AI_API_KEY / AI_API_URL / AI_MODEL
`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});