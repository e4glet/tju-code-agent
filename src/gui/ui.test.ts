import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { APP_JS, STYLE_CSS, VIEW_HTML } from "./ui.ts";

/**
 * `APP_JS` is a plain template literal holding the whole front-end source, so
 * TypeScript only ever sees a string — it cannot tell that an escape was
 * evaluated away inside it. Writing `\n` where `\\n` was meant turns into a
 * real newline inside a double-quoted string and kills the page with a
 * SyntaxError that `tsc --noEmit` accepts without complaint. That is exactly
 * what `connectEvents()` did (`buffer.split("\n\n")`), and it took the entire
 * GUI down.
 *
 * Compiling the evaluated template here makes that class of bug fail the suite
 * instead of shipping. See AGENTS.md ("APP_JS 是模板字符串").
 */
describe("GUI template literals are valid after evaluation", () => {
	it("APP_JS compiles as a script", () => {
		expect(() => new Script(APP_JS)).not.toThrow();
	});

	it("keeps the SSE frame separators escaped", () => {
		expect(APP_JS).toContain('split("\\n\\n")');
		expect(APP_JS).toContain('split("\\n")');
	});

	it("emits intact HTML and CSS containers", () => {
		expect(VIEW_HTML).toContain('name="agent-token"');
		expect(VIEW_HTML.trimEnd().endsWith("</html>")).toBe(true);
		expect(STYLE_CSS).toContain(":root {");
	});
});
