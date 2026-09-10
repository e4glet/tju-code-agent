import type { AgentLoopConfig, AssistantMessage } from "./types.ts";

const MAX_CORRECTIONS_PER_RUN = 3;
const REPEAT_LIMIT = 3;

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
 * Default self-correction policy that keeps the agent focused on the user's
 * task by detecting two failure modes:
 *
 * - Repeating the same tool call (same name and arguments) several turns in a
 *   row usually means the agent is looping on a failed action.
 * - An empty turn (no tool calls and no text) means the agent stalled or went
 *   off-task without saying anything useful.
 *
 * Corrections are injected only when an anomaly is detected (never every
 * turn) and are capped per run so a stubborn model cannot ping-pong forever.
 */
export function createSelfCorrection(): NonNullable<AgentLoopConfig["afterTurn"]> {
	let lastCalls: Array<{ name: string; key: string }> = [];
	let repeatCount = 0;
	let correctionBudget = MAX_CORRECTIONS_PER_RUN;

	return async ({ message, toolCalls }) => {
		if (correctionBudget <= 0) return null;

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

		return null;
	};
}
