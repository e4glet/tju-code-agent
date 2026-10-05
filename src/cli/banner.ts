import { APP_VERSION } from "../version.ts";

export { APP_VERSION };
export const APP_NAME = "Tju code";

const GLYPHS: Record<string, string[]> = {
	T: ["█████", "  █  ", "  █  ", "  █  ", "  █  "],
	J: [" ███ ", "   █ ", "   █ ", " █ █ ", " ███ "],
	U: ["█   █", "█   █", "█   █", "█   █", " ███ "],
	C: [" ███ ", "█    ", "█    ", "█    ", " ███ "],
	O: [" ███ ", "█   █", "█   █", "█   █", " ███ "],
	D: ["████ ", "█   █", "█   █", "█   █", "████ "],
	E: ["█████", "█    ", "███  ", "█    ", "█████"],
};

function render(word: string): string {
	const rows = Array.from({ length: 5 }, () => "");
	for (const ch of word) {
		const glyph = GLYPHS[ch];
		for (let r = 0; r < 5; r++) {
			rows[r] += (glyph?.[r] ?? "     ") + " ";
		}
	}
	return rows.map((r) => r.trimEnd()).join("\n");
}

export function formatBanner(provider: string, model: string, cwd: string, dataRoot: string): string {
	return [
		"",
		`\u001b[36m${render("TJU CODE")}\u001b[0m`,
		"",
		`\u001b[90m${APP_NAME} v${APP_VERSION} - a coding agent (model ${provider}/${model})\u001b[0m`,
		`Commands: /help /status /model /clear /abort /exit`,
		`cwd: ${cwd}`,
		`data: ${dataRoot}`,
		"",
	].join("\n");
}

export function printBanner(provider: string, model: string, cwd: string, dataRoot: string): void {
	process.stdout.write(formatBanner(provider, model, cwd, dataRoot) + "\n");
}
