import { describe, expect, it } from "vitest";
import { Agent } from "../agent.ts";
import type { Model } from "../types.ts";
import { askUserSchema, createAskUserTool } from "./ask.ts";

const BASE_MODEL: Model = { id: "m1", api: "openai-completions", provider: "openai" };

function runTool(tool: ReturnType<typeof createAskUserTool>, args: unknown) {
	return tool.execute({ toolCallId: "t1", signal: undefined, onUpdate: () => {} }, args as never);
}

describe("ask_user tool", () => {
	it("rejects empty questions and option lists outside 1-3", () => {
		expect(askUserSchema.safeParse({ question: "", options: ["a"] }).success).toBe(false);
		expect(askUserSchema.safeParse({ question: "q?", options: [] }).success).toBe(false);
		expect(
			askUserSchema.safeParse({ question: "q?", options: ["a", "b", "c", "d"] }).success,
		).toBe(false);
		expect(askUserSchema.safeParse({ question: "q?", options: ["a", "b"] }).success).toBe(true);
	});

	it("returns the user's answer as the result", async () => {
		const seen: string[] = [];
		const tool = createAskUserTool({
			canAsk: () => true,
			ask: async (req) => {
				seen.push(`${req.question}|${req.options.join(",")}`);
				return "custom answer";
			},
		});
		const result = await runTool(tool, { question: "Which?", options: ["a", "b"] });
		expect(result.content).toContain("custom answer");
		expect(seen).toEqual(["Which?|a,b"]);
	});

	it("tells the model to proceed when the slot is gone", async () => {
		let asked = 0;
		const tool = createAskUserTool({
			canAsk: () => false,
			ask: async () => {
				asked++;
				return "never";
			},
		});
		const result = await runTool(tool, { question: "q?", options: ["a"] });
		expect(result.content).toContain("best judgment");
		expect(asked).toBe(0);
	});

	it("degrades to best judgment when asking fails", async () => {
		const tool = createAskUserTool({
			canAsk: () => true,
			ask: async () => {
				throw new Error("Question cancelled");
			},
		});
		const result = await runTool(tool, { question: "q?", options: ["a"] });
		expect(result.content).toContain("best judgment");
	});

	it("refunds the slot when the question never reached the user", async () => {
		let refunded = 0;
		const tool = createAskUserTool({
			canAsk: () => true,
			releaseAskSlot: () => {
				refunded++;
			},
			ask: async () => {
				throw new Error("Question cancelled");
			},
		});
		await runTool(tool, { question: "q?", options: ["a"] });
		expect(refunded).toBe(1);
	});

	it("keeps the slot spent when the user actually answered", async () => {
		let refunded = 0;
		const tool = createAskUserTool({
			canAsk: () => true,
			releaseAskSlot: () => {
				refunded++;
			},
			ask: async () => "a",
		});
		await runTool(tool, { question: "q?", options: ["a"] });
		expect(refunded).toBe(0);
	});
});

describe("Agent ask slots", () => {
	it("allows one question then denies until the next run", () => {
		const agent = new Agent({ model: BASE_MODEL });
		expect(agent.consumeAskSlot()).toBe(true);
		expect(agent.consumeAskSlot()).toBe(false);
	});

	it("lets a cancelled question be asked again in the same run", () => {
		const agent = new Agent({ model: BASE_MODEL });
		expect(agent.consumeAskSlot()).toBe(true);
		expect(agent.consumeAskSlot()).toBe(false);
		agent.releaseAskSlot();
		expect(agent.consumeAskSlot()).toBe(true);
	});

	it("never refunds below zero", () => {
		const agent = new Agent({ model: BASE_MODEL });
		agent.releaseAskSlot();
		expect(agent.consumeAskSlot()).toBe(true);
	});
});
