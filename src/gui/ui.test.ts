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

	it("renders answer footers from the message identity, not the live selection", () => {
		expect(APP_JS).toContain("foot._modelId");
		expect(APP_JS).toContain("formatEffortLabel");
		expect(APP_JS).toContain("appendAnswerFooter(pendingAssistant, e.message.model, e.message.reasoningEffort)");
		expect(APP_JS).toContain("appendAnswerFooter(b, m.model, m.reasoningEffort)");
		expect(APP_JS).toContain("setFooterMeta(segFooter, segEnd - segStart, segModel, segEffort)");
		expect(APP_JS).not.toContain('prettyModelName(currentModelId) + " (" + effortLabel() + ")"');
	});

	it("shows about instead of a duplicate current-interface row in settings", () => {
		expect(VIEW_HTML).toContain("关于");
		expect(VIEW_HTML).toContain("TJU Code");
		expect(VIEW_HTML).toContain("天津大学系统安全与可信计算研究中心自研智能体编码工具");
		expect(VIEW_HTML).not.toContain("provider-current");
		expect(VIEW_HTML).not.toContain("provider-current-detail");
		expect(APP_JS).not.toContain("renderProviderCurrent");
		expect(APP_JS).not.toContain("provider-current");
	});

	it("reconnects a stalled event stream instead of hanging on a half-open socket", () => {
		expect(APP_JS).toContain("EVENT_STREAM_IDLE_MS");
		expect(APP_JS).toContain("eventStreamLastFrame");
		expect(APP_JS).toContain("eventStreamController.abort()");
		expect(APP_JS).toContain("eventStreamController = new AbortController()");
	});

	it("accumulates message_update deltas instead of expecting a full message", () => {
		expect(APP_JS).toContain("function applyStreamDeltaTo(buf, e)");
		expect(APP_JS).toContain("function newStreamDelta(msg)");
		expect(APP_JS).toContain("streamRenderMsg = accMsg;");
		expect(APP_JS).toContain("trajMessageUpdate(liveWs, accMsg);");
		expect(APP_JS).toContain("ws.streamDelta = newStreamDelta(e.message)");
		// The old per-frame full-message assumption must be gone.
		expect(APP_JS).not.toContain("streamRenderMsg = e.message;");
		expect(APP_JS).not.toContain("trajMessageUpdate(liveWs, e.message);");
		expect(APP_JS).not.toContain("trajMessageUpdate(ws, e.message);");
	});
});
