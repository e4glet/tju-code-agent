import type { AgentLoopConfig, AssistantMessage } from "./types.ts";

const MAX_CORRECTIONS_PER_RUN = 3;
const REPEAT_LIMIT = 3;
const WHOLE_REREAD_LIMIT = 3;
const STALE_TODO_TURNS = 6;
/** Correction budget refreshes every this many turns, so a long (renewed) run
 * does not spend its whole allowance in the first 25 turns and then run blind. */
const CORRECTION_WINDOW_TURNS = 25;
/** The plan-staleness nag is advisory: its own cap, refreshed per window. */
const MAX_TODO_NAGS_PER_WINDOW = 1;

/** Once this run has changed a file, this many turns with no further change means
 * the work has turned into checking. Advisory, so it has its own cap as well. */
const CLOSURE_IDLE_TURNS = 8;
const MAX_CLOSURE_NAGS_PER_WINDOW = 1;

const EDIT_TOOL_NAMES = new Set(["edit", "write", "apply_patch"]);

function normalizeReadPath(path: string): string {
	const unified = path.replace(/\//g, "\\");
	return process.platform === "win32" ? unified.toLowerCase() : unified;
}

function readPathOf(call: { name: string; arguments: Record<string, unknown> }): string | null {
	if (call.name !== "read") return null;
	const path = call.arguments.path;
	return typeof path === "string" && path ? path : null;
}

function isWholeFileRead(call: { name: string; arguments: Record<string, unknown> }): boolean {
	return call.name === "read" && call.arguments.offset == null && call.arguments.limit == null;
}

function editedPathsOf(call: { name: string; arguments: Record<string, unknown> }): string[] {
	if (!EDIT_TOOL_NAMES.has(call.name)) return [];
	if (call.name === "apply_patch") {
		const operations = call.arguments.operations;
		if (!Array.isArray(operations)) return [];
		const paths: string[] = [];
		for (const op of operations) {
			if (op && typeof op === "object" && typeof (op as { path?: unknown }).path === "string") {
				paths.push((op as { path: string }).path);
			}
		}
		return paths;
	}
	return typeof call.arguments.path === "string" && call.arguments.path ? [call.arguments.path] : [];
}

function extractText(message: AssistantMessage): string {
	return message.content
		.filter((c) => (c.type === "text" && !!c.text) || (c.type === "thinking" && !!c.thinking))
		.map((c) => (c.type === "text" ? c.text : (c as { thinking?: string }).thinking) ?? "")
		.join("");
}

function sameCalls(
	a: Array<{ name: string; key: string }>,
	b: Array<{ name: string; key: string }>,
): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i]!.name !== b[i]!.name || a[i]!.key !== b[i]!.key) return false;
	}
	return true;
}

/**
 * Default self-correction policy. Three kinds of prompt are produced, with
 * separate budgets so an advisory one can never starve an anomaly one:
 *
 * - **Anomaly** (shared budget, refreshed every {@link CORRECTION_WINDOW_TURNS}
 *   turns): repeating the same tool call with the same arguments several turns
 *   in a row, an empty turn, or reading the same file whole repeatedly *while its
 *   body is still in view*.
 * - **Advisory — stale plan** (own budget, at most {@link MAX_TODO_NAGS_PER_WINDOW}
 *   per window): the plan still shows in-progress items even though files have
 *   changed since it was written.
 * - **Advisory — closure** (own budget, at most {@link MAX_CLOSURE_NAGS_PER_WINDOW}
 *   per window): this run has already changed a file, and nothing has been written
 *   for {@link CLOSURE_IDLE_TURNS} turns. Measured on a real 99-turn run, the fix
 *   landed at turn 14 and the remaining 85 turns were checking; nothing in the
 *   loop noticed, because every existing guard keys on *form* (identical arguments,
 *   turn cap, plan age) while the waste was the same question asked in slightly
 *   different words.
 *
 * Either way the text is handed back to the loop, which delivers it as an
 * ephemeral trailing instruction (never a transcript entry). Corrections fire
 * only on an actual anomaly and are bounded per run, so a focused agent is never
 * disturbed and a stubborn one cannot ping-pong forever.
 */
export function createSelfCorrection(options?: {
	getPlanState?: () => { open: number; active: number };
	/** Experiment arm B: refresh the anomaly budget every `CORRECTION_WINDOW_TURNS`. */
	refreshBudgetPerWindow?: boolean;
}): NonNullable<AgentLoopConfig["afterTurn"]> {
	let lastCalls: Array<{ name: string; key: string }> = [];
	let repeatCount = 0;
	let correctionBudget = MAX_CORRECTIONS_PER_RUN;
	let wholeReads = new Map<string, { display: string; count: number }>();
	const warnedPaths = new Set<string>();
	let turnsSinceTodoWrite = 0;
	let budgetWindow = 0;
	// Whether *this run* has actually produced a plan. A todo list restored from a
	// previous task must never trigger the nag (or its destructive "send the whole
	// list" prescription) in an unrelated run.
	let runTouchedTodoList = false;
	// The nag is advisory, so it gets its own cap and never eats the anomaly
	// budget that exists to break runaway loops.
	let todoNagBudget = MAX_TODO_NAGS_PER_WINDOW;
	let closureNagBudget = MAX_CLOSURE_NAGS_PER_WINDOW;
	// Whether this run has changed a file at all: only then does "nothing changed
	// for N turns" mean anything (a research-only run never triggers it).
	let runChangedFiles = false;
	let idleSinceChange = 0;
	// Only nag when there is something the plan fails to reflect: file changes
	// since the last plan update. A plan that is merely "open" while the model is
	// still investigating is not stale — it is just early.
	let changedFilesSincePlan = false;

	return async ({ message, toolCalls, toolResults, turnCount }) => {
		const window = options?.refreshBudgetPerWindow === false
			? 0
			: Math.floor(Math.max(0, (turnCount ?? 1) - 1) / CORRECTION_WINDOW_TURNS);
		if (window !== budgetWindow) {
			budgetWindow = window;
			correctionBudget = MAX_CORRECTIONS_PER_RUN;
			todoNagBudget = MAX_TODO_NAGS_PER_WINDOW;
			closureNagBudget = MAX_CLOSURE_NAGS_PER_WINDOW;
			lastCalls = [];
			repeatCount = 0;
			wholeReads = new Map();
			warnedPaths.clear();
		}

		const resultsByCall = new Map<string, boolean>();
		for (const result of toolResults) resultsByCall.set(result.toolCallId, !result.isError);
		const fileChanged = toolCalls.some((call) => EDIT_TOOL_NAMES.has(call.name) && resultsByCall.get(call.id) === true);
		if (fileChanged) {
			changedFilesSincePlan = true;
			runChangedFiles = true;
			idleSinceChange = 0;
		} else if (runChangedFiles) {
			idleSinceChange++;
		}

		if (toolCalls.some((call) => call.name === "todowrite")) {
			runTouchedTodoList = true;
			turnsSinceTodoWrite = 0;
			changedFilesSincePlan = false;
		} else {
			const plan = runTouchedTodoList ? options?.getPlanState?.() : undefined;
			if (plan && plan.active > 0 && changedFilesSincePlan) {
				turnsSinceTodoWrite++;
				if (turnsSinceTodoWrite >= STALE_TODO_TURNS && todoNagBudget > 0) {
					todoNagBudget--;
					turnsSinceTodoWrite = 0;
					return (
						"[system] Your plan still shows in-progress items but has not been updated for " +
						`${STALE_TODO_TURNS} turns, even though files have changed since. Send the full list with todowrite so each finished item is marked completed.`
					);
				}
			} else {
				turnsSinceTodoWrite = 0;
			}
		}

		if (correctionBudget <= 0) return null;

		for (const call of toolCalls) {
			if (resultsByCall.get(call.id) !== true) continue;
			for (const path of editedPathsOf({ name: call.name, arguments: call.arguments })) {
				wholeReads.delete(normalizeReadPath(path));
			}
		}
		for (const call of toolCalls) {
			if (!isWholeFileRead({ name: call.name, arguments: call.arguments })) continue;
			const path = readPathOf({ name: call.name, arguments: call.arguments });
			if (!path) continue;
			const key = normalizeReadPath(path);
			// A fresh read result is pinned in the outbound window (see
			// applyToolBudget), so a repeat usually means the model is looping rather
			// than re-fetching something it lost. The message stays factual: the
			// guard cannot prove visibility, so it does not claim it.
			const entry = wholeReads.get(key) ?? { display: path, count: 0 };
			entry.count++;
			wholeReads.set(key, entry);
			if (entry.count >= WHOLE_REREAD_LIMIT && !warnedPaths.has(key)) {
				warnedPaths.add(key);
				correctionBudget--;
				return (
					`[system] You have read ${entry.display} whole ${entry.count} times this run. ` +
					"Stop re-reading the whole file: re-fetch only the exact lines you need with offset/limit, or use grep to locate them first."
				);
			}
		}

		const calls = toolCalls.map((c) => ({ name: c.name, key: JSON.stringify(c.arguments) }));
		if (calls.length > 0 && sameCalls(calls, lastCalls)) {
			repeatCount++;
			if (repeatCount >= REPEAT_LIMIT) {
				lastCalls = [];
				repeatCount = 0;
				correctionBudget--;
				return (
					"[system] You are repeating the same tool call with the same arguments. " +
					"Stop, inspect the last result, and either change your approach or report the blocker instead of retrying the same action."
				);
			}
		} else {
			lastCalls = calls;
			repeatCount = calls.length > 0 ? 1 : 0;
		}

		if (calls.length === 0 && !extractText(message).trim()) {
			correctionBudget--;
			return (
				"[system] Your previous turn was empty. Restate the user's original request and your current progress in one or two sentences, then take the next concrete step."
			);
		}

		// Advisory: this run already changed a file and nothing has been written for
		// CLOSURE_IDLE_TURNS turns — the work has turned into checking. Stated as a
		// fact with both exits, so it neither pushes the model to stop short nor lets
		// it wander on: conclude, or name the one fact still missing.
		if (runChangedFiles && idleSinceChange >= CLOSURE_IDLE_TURNS && closureNagBudget > 0) {
			closureNagBudget--;
			idleSinceChange = 0;
			return (
				`[system] Nothing has been written for ${CLOSURE_IDLE_TURNS} turns; the last change is already in. ` +
				"If the evidence you have is enough, summarise the result now. If one specific fact is still missing, name it and fetch exactly that."
			);
		}

		return null;
	};
}
