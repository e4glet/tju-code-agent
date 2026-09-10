/**
 * Reasoning effort scale shared by the GUI, the persisted model config and the
 * provider adapters. Mirrors the DeepSeek `reasoning_effort` vocabulary
 * (`none` turns thinking off, `low`/`high`/`max` turn it on).
 */
export type ReasoningEffort = "none" | "low" | "high" | "max";

/** Canonical effort values, from "thinking off" to the deepest setting. */
export const REASONING_EFFORTS: readonly ReasoningEffort[] = ["none", "low", "high", "max"];

/**
 * Provider aliases folded onto the canonical scale. `minimal`/`medium`/`xhigh`
 * are what DeepSeek accepts from older clients; `ultra` maps to `max`.
 */
const EFFORT_ALIASES: Record<string, ReasoningEffort> = {
	none: "none",
	minimal: "low",
	low: "low",
	medium: "high",
	high: "high",
	xhigh: "high",
	max: "max",
	ultra: "max",
};

/** Fold a stored or client-supplied effort onto the canonical scale. Unknown values yield undefined. */
export function normalizeReasoningEffort(value: unknown): ReasoningEffort | undefined {
	if (typeof value !== "string") return undefined;
	return EFFORT_ALIASES[value.trim().toLowerCase()];
}

/**
 * True for endpoints that follow DeepSeek's reasoning controls (they accept
 * `reasoning_effort`, and `output_config.effort` on the Anthropic format).
 * Detected from the model id or base URL so other providers keep their own
 * thinking parameters.
 */
export function isDeepSeekProvider(modelId: string, baseUrl?: string): boolean {
	return /deepseek/i.test(modelId) || /deepseek/i.test(baseUrl ?? "");
}
