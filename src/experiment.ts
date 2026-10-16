/**
 * Runtime switches for the A/B/C evaluation described in
 * `维护记录/2026-10-15 方案：任务执行质量与效率的对照评估（A-B-C）.md`.
 *
 * `TJU_CODE_EXPERIMENT` selects which arm this process runs:
 *   both      (default) — B + C, i.e. the shipping behaviour of 0.1.15.7
 *   anchor              — B only
 *   delegate            — C only
 *   none                — baseline A
 *
 * Default is `both`, so nothing changes unless the variable is set. Remove this
 * module once the evaluation is settled.
 */
export type ExperimentMode = "none" | "anchor" | "delegate" | "both";

export interface ExperimentFlags {
	mode: ExperimentMode;
	/** B: per-turn goal anchor + correction budget refreshed each window. */
	anchor: boolean;
	/** C: read-only explore sub-agent, result contract, concurrency cap. */
	delegate: boolean;
}

const MODES: readonly ExperimentMode[] = ["none", "anchor", "delegate", "both"];

export function resolveExperiment(env: Record<string, string | undefined> = process.env): ExperimentFlags {
	const raw = (env.TJU_CODE_EXPERIMENT ?? "both").trim().toLowerCase();
	const mode = (MODES as readonly string[]).includes(raw) ? (raw as ExperimentMode) : "both";
	return { mode, anchor: mode === "anchor" || mode === "both", delegate: mode === "delegate" || mode === "both" };
}

export const EXPERIMENT: ExperimentFlags = resolveExperiment();
