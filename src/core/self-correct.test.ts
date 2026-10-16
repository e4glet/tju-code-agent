import { describe, expect, it } from "vitest";
import { createSelfCorrection } from "./self-correct.ts";
import type { AssistantMessage, ToolCallContent, ToolResultMessage } from "./types.ts";

let seq = 0;

function assistant(): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: "working" }],
		api: "openai-completions",
		provider: "openai",
		model: "m",
		usage: { input: 0, output: 0, totalTokens: 0 },
		stopReason: "stop",
		timestamp: 1,
	};
}

function call(name: string, args: Record<string, unknown>): ToolCallContent {
	return { type: "toolCall", id: `c${seq++}`, name, arguments: args };
}

function okResult(call: ToolCallContent): ToolResultMessage {
	return { role: "toolResult", toolCallId: call.id, toolName: call.name, content: "done", isError: false, timestamp: 2 };
}

function errResult(call: ToolCallContent): ToolResultMessage {
	return { role: "toolResult", toolCallId: call.id, toolName: call.name, content: "boom", isError: true, timestamp: 2 };
}

async function turn(
	hook: ReturnType<typeof createSelfCorrection>,
	calls: ToolCallContent[],
	results: ToolResultMessage[],
	turnCount = 1,
): Promise<string | null> {
	return hook({ message: assistant(), toolCalls: calls, toolResults: results, turnCount });
}

describe("self-correction whole-file re-read guard", () => {
	it("stays silent for varied normal work", async () => {
		const hook = createSelfCorrection();
		expect(await turn(hook, [call("read", { path: "a.ts" })], [])).toBeNull();
		expect(await turn(hook, [call("grep", { pattern: "x" })], [])).toBeNull();
	});

	it("warns on the third whole-file read of the same path, once per path", async () => {
		const hook = createSelfCorrection();
		const r1 = call("read", { path: "src/config.ts" });
		const r2 = call("read", { path: "src/config.ts" });
		const r3 = call("read", { path: "src/config.ts" });
		const r4 = call("read", { path: "src/config.ts" });
		expect(await turn(hook, [r1], [okResult(r1)])).toBeNull();
		expect(await turn(hook, [r2], [okResult(r2)])).toBeNull();
		const warned = await turn(hook, [r3], [okResult(r3)]);
		expect(warned).toContain("src/config.ts");
		expect(warned).toContain("offset/limit");
		// The whole-read warning fires once per path; a fourth consecutive
		// identical read escalates to the repeat-call correction instead.
		expect(await turn(hook, [r4], [okResult(r4)])).toContain("repeating the same tool call");
	});

	it("ignores sliced reads", async () => {
		const hook = createSelfCorrection();
		for (let i = 0; i < 5; i++) {
			const r = call("read", { path: "big.ts", offset: i * 10 + 1, limit: 10 });
			expect(await turn(hook, [r], [okResult(r)])).toBeNull();
		}
	});

	it("resets the counter when the file is successfully edited", async () => {
		const hook = createSelfCorrection();
		for (let i = 0; i < 2; i++) {
			const r = call("read", { path: "a.ts" });
			expect(await turn(hook, [r], [okResult(r)])).toBeNull();
		}
		const e = call("edit", { path: "a.ts", oldString: "x", newString: "y" });
		expect(await turn(hook, [e], [okResult(e)])).toBeNull();
		for (let i = 0; i < 2; i++) {
			const r = call("read", { path: "a.ts" });
			expect(await turn(hook, [r], [okResult(r)])).toBeNull();
		}
		const r = call("read", { path: "a.ts" });
		expect(await turn(hook, [r], [okResult(r)])).toContain("a.ts");
	});

	it("does not reset on a failed edit", async () => {
		const hook = createSelfCorrection();
		for (let i = 0; i < 2; i++) {
			const r = call("read", { path: "a.ts" });
			expect(await turn(hook, [r], [okResult(r)])).toBeNull();
		}
		const e = call("edit", { path: "a.ts", oldString: "x", newString: "y" });
		expect(await turn(hook, [e], [errResult(e)])).toBeNull();
		const r = call("read", { path: "a.ts" });
		expect(await turn(hook, [r], [okResult(r)])).toContain("a.ts");
	});

	it("still catches exact repeats of non-read calls", async () => {
		const hook = createSelfCorrection();
		let warned: string | null = null;
		for (let i = 0; i < 3; i++) {
			const c = call("bash", { command: "dir" });
			warned = await turn(hook, [c], [okResult(c)]);
		}
		expect(warned).toContain("repeating the same tool call");
	});
});

describe("self-correction closure nag", () => {
	it("stays silent in a research-only run that never changes a file", async () => {
		const hook = createSelfCorrection();
		for (let t = 1; t <= 20; t++) {
			const c = call("grep", { pattern: `p${t}` });
			expect(await turn(hook, [c], [okResult(c)], t)).toBeNull();
		}
	});

	it("does not count a failed write as a change", async () => {
		const hook = createSelfCorrection();
		const w = call("edit", { path: "a.ts", oldString: "x", newString: "y" });
		expect(await turn(hook, [w], [errResult(w)], 1)).toBeNull();
		for (let t = 2; t <= 20; t++) {
			const c = call("grep", { pattern: `p${t}` });
			expect(await turn(hook, [c], [okResult(c)], t)).toBeNull();
		}
	});

	it("nags once per window after CLOSURE_IDLE_TURNS quiet turns, and a fresh change restarts the count", async () => {
		const hook = createSelfCorrection();
		const w1 = call("edit", { path: "a.ts", oldString: "x", newString: "y" });
		expect(await turn(hook, [w1], [okResult(w1)], 1)).toBeNull();

		// Seven quiet turns after a change: still inside the tolerance.
		const quiet: number[] = [];
		for (let t = 2; t <= 8; t++) {
			const c = call("grep", { pattern: `p${t}` });
			const note = await turn(hook, [c], [okResult(c)], t);
			expect(note).toBeNull();
			quiet.push(t);
		}

		// A new change restarts the count.
		const w2 = call("edit", { path: "b.ts", oldString: "x", newString: "y" });
		expect(await turn(hook, [w2], [okResult(w2)], 9)).toBeNull();
		for (let t = 10; t <= 16; t++) {
			const c = call("grep", { pattern: `q${t}` });
			expect(await turn(hook, [c], [okResult(c)], t)).toBeNull();
		}

		// Eighth quiet turn of the second stretch: the nag fires, naming both exits.
		const c17 = call("grep", { pattern: "q17" });
		const nag = await turn(hook, [c17], [okResult(c17)], 17);
		expect(nag).toContain("Nothing has been written for 8 turns");
		expect(nag).toContain("summarise the result now");
		expect(nag).toContain("name it and fetch exactly that");

		// Then it stays quiet until the next 25-turn window refreshes its budget.
		for (let t = 18; t <= 25; t++) {
			const c = call("grep", { pattern: `r${t}` });
			expect(await turn(hook, [c], [okResult(c)], t)).toBeNull();
		}
		const c26 = call("grep", { pattern: "r26" });
		expect(await turn(hook, [c26], [okResult(c26)], 26)).toContain("Nothing has been written");
	});
});

describe("self-correction stale todo reminder", () => {
	function quietTurn(path: string) {
		const c = call("read", { path, offset: 1, limit: 5 });
		return { calls: [c], results: [okResult(c)] };
	}
	// Two advisories can fire on a quiet run. These cases lock the *plan* nag, so
	// they ask which note came back instead of requiring silence.
	const isPlanNag = (note: string | null): boolean => Boolean(note && note.includes("todowrite"));

	it("reminds after a few quiet turns, but only with an active item and file changes", async () => {
		const hook = createSelfCorrection({ getPlanState: () => ({ open: 2, active: 1 }) });
		const t = call("todowrite", { todos: [{ content: "a", status: "active" }] });
		expect(await turn(hook, [t], [okResult(t)], 1)).toBeNull();
		// File changes must exist since the plan update, otherwise the plan is
		// merely early, not stale.
		const e = call("edit", { path: "a.ts", oldString: "x", newString: "y" });
		expect(await turn(hook, [e], [okResult(e)], 2)).toBeNull();
		let warned: string | null = null;
		let firedAt = -1;
		for (let i = 3; i <= 12; i++) {
			const { calls, results } = quietTurn(i % 2 === 0 ? "a.ts" : "b.ts");
			const out = await turn(hook, calls, results, i);
			if (out !== null && firedAt < 0) {
				firedAt = i;
				warned = out;
			}
		}
		expect(firedAt).toBe(7);
		expect(warned).toContain("todowrite");
		expect(warned).toContain("completed");
	});

	it("stays silent while only pending items exist", async () => {
		const hook = createSelfCorrection({ getPlanState: () => ({ open: 3, active: 0 }) });
		const t = call("todowrite", { todos: [{ content: "a", status: "pending" }] });
		await turn(hook, [t], [okResult(t)]);
		const e = call("edit", { path: "a.ts", oldString: "x", newString: "y" });
		await turn(hook, [e], [okResult(e)], 2);
		for (let i = 3; i <= 15; i++) {
			const { calls, results } = quietTurn(i % 2 === 0 ? "a.ts" : "b.ts");
			expect(isPlanNag(await turn(hook, calls, results, i))).toBe(false);
		}
	});

	it("stays silent when no file has changed since the plan update", async () => {
		const hook = createSelfCorrection({ getPlanState: () => ({ open: 2, active: 1 }) });
		const t = call("todowrite", { todos: [{ content: "a", status: "active" }] });
		await turn(hook, [t], [okResult(t)]);
		for (let i = 2; i <= 15; i++) {
			const { calls, results } = quietTurn(i % 2 === 0 ? "a.ts" : "b.ts");
			expect(await turn(hook, calls, results, i)).toBeNull();
		}
	});

	it("ignores a plan inherited from another task (never touched this run)", async () => {
		const hook = createSelfCorrection({ getPlanState: () => ({ open: 12, active: 5 }) });
		const e = call("edit", { path: "a.ts", oldString: "x", newString: "y" });
		await turn(hook, [e], [okResult(e)], 1);
		for (let i = 2; i <= 20; i++) {
			const { calls, results } = quietTurn(i % 2 === 0 ? "a.ts" : "b.ts");
			expect(isPlanNag(await turn(hook, calls, results, i))).toBe(false);
		}
	});

	it("caps the plan nag at once per window and never spends the anomaly budget", async () => {
		const hook = createSelfCorrection({ getPlanState: () => ({ open: 1, active: 1 }) });
		const t = call("todowrite", { todos: [{ content: "a", status: "active" }] });
		await turn(hook, [t], [okResult(t)], 1);
		const e = call("edit", { path: "a.ts", oldString: "x", newString: "y" });
		await turn(hook, [e], [okResult(e)], 2);
		let nags = 0;
		for (let i = 3; i <= 25; i++) {
			const { calls, results } = quietTurn(i % 2 === 0 ? "a.ts" : "b.ts");
			if (isPlanNag(await turn(hook, calls, results, i))) nags++;
		}
		expect(nags).toBe(1);
	});

	it("refreshes the correction budget each 25-turn window", async () => {
		const hook = createSelfCorrection({ getPlanState: () => ({ open: 1, active: 1 }) });
		const t = call("todowrite", { todos: [{ content: "a", status: "active" }] });
		await turn(hook, [t], [okResult(t)], 1);
		const e = call("edit", { path: "a.ts", oldString: "x", newString: "y" });
		await turn(hook, [e], [okResult(e)], 2);
		let fires = 0;
		for (let i = 3; i <= 25; i++) {
			const { calls, results } = quietTurn(i % 2 === 0 ? "a.ts" : "b.ts");
			if (isPlanNag(await turn(hook, calls, results, i))) fires++;
		}
		expect(fires).toBe(1);
		for (let i = 26; i <= 50; i++) {
			const { calls, results } = quietTurn(i % 2 === 0 ? "a.ts" : "b.ts");
			if (isPlanNag(await turn(hook, calls, results, i))) fires++;
		}
		expect(fires).toBeGreaterThan(1);
	});

	it("resets the streak when todowrite is called", async () => {
		const hook = createSelfCorrection({ getPlanState: () => ({ open: 1, active: 1 }) });
		for (let i = 0; i < 5; i++) {
			const { calls, results } = quietTurn(i % 2 === 0 ? "a.ts" : "b.ts");
			expect(await turn(hook, calls, results)).toBeNull();
		}
		const t = call("todowrite", { todos: [{ content: "a", status: "completed" }] });
		expect(await turn(hook, [t], [okResult(t)])).toBeNull();
		for (let i = 0; i < 5; i++) {
			const { calls, results } = quietTurn(i % 2 === 0 ? "a.ts" : "b.ts");
			expect(await turn(hook, calls, results)).toBeNull();
		}
	});

	it("shares one anomaly budget across the guard triggers", async () => {
		const hook = createSelfCorrection();
		const fired: Array<string | null> = [];
		// Three distinct files, each whole-read three times: three guard fires.
		for (const file of ["a.ts", "b.ts", "c.ts"]) {
			for (let i = 0; i < 3; i++) {
				const r = call("read", { path: file });
				fired.push(await turn(hook, [r], [okResult(r)]));
			}
		}
		expect(fired.filter((m) => m !== null)).toHaveLength(3);
		// A fourth file cannot fire: the shared budget is spent.
		for (let i = 0; i < 3; i++) {
			const r = call("read", { path: "d.ts" });
			fired.push(await turn(hook, [r], [okResult(r)]));
		}
		expect(fired.filter((m) => m !== null)).toHaveLength(3);
	});

	it("does not refresh the budget when arm B is off", async () => {
		const hook = createSelfCorrection({ refreshBudgetPerWindow: false });
		let fires = 0;
		for (const file of ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"]) {
			for (let i = 0; i < 3; i++) {
				const r = call("read", { path: file });
				// turnCount 50 would be a fresh window with the switch on.
				if (await turn(hook, [r], [okResult(r)], 50)) fires++;
			}
		}
		expect(fires).toBe(3);
	});
});
