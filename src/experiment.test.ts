import { describe, expect, it } from "vitest";
import { resolveExperiment } from "./experiment.ts";

describe("experiment mode", () => {
	it("defaults to both arms when unset or unrecognised", () => {
		expect(resolveExperiment({})).toEqual({ mode: "both", anchor: true, delegate: true });
		expect(resolveExperiment({ TJU_CODE_EXPERIMENT: "nonsense" })).toEqual({ mode: "both", anchor: true, delegate: true });
	});

	it("maps each mode to exactly its arms", () => {
		expect(resolveExperiment({ TJU_CODE_EXPERIMENT: "none" })).toEqual({ mode: "none", anchor: false, delegate: false });
		expect(resolveExperiment({ TJU_CODE_EXPERIMENT: "anchor" })).toEqual({ mode: "anchor", anchor: true, delegate: false });
		expect(resolveExperiment({ TJU_CODE_EXPERIMENT: "delegate" })).toEqual({ mode: "delegate", anchor: false, delegate: true });
		expect(resolveExperiment({ TJU_CODE_EXPERIMENT: " BOTH " })).toEqual({ mode: "both", anchor: true, delegate: true });
	});
});
