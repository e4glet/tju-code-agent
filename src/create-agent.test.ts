import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RunConfig } from "./config.ts";
import { Agent } from "./core/agent.ts";
import { createAllTools } from "./core/tools/index.ts";
import type { Model } from "./core/types.ts";
import { buildAgentTools, createAgent } from "./create-agent.ts";

const BASE_MODEL: Model = { id: "m1", api: "openai-completions", provider: "openai" };
const BASE_CONFIG: RunConfig = { api: "openai-completions", provider: "openai", model: "m1" };

const dirs: string[] = [];

function freshDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "tju-toolchain-"));
	dirs.push(dir);
	return dir;
}

afterEach(() => {
	while (dirs.length) {
		const dir = dirs.pop();
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
});

async function run(tool: { execute: (...args: never[]) => Promise<{ content: string }> }, args: unknown) {
	return await tool.execute(
		{ toolCallId: "t1", signal: undefined, onUpdate: () => {} } as never,
		args as never,
	);
}

function readTool(tools: ReturnType<typeof buildAgentTools>) {
	const tool = tools.find((t) => t.name === "read");
	if (!tool) throw new Error("read tool missing");
	return tool;
}

describe("buildAgentTools", () => {
	it("keeps the full composition: base tools plus todowrite, task and ask_user", () => {
		const dir = freshDir();
		const agent = new Agent({ model: BASE_MODEL });
		const names = buildAgentTools(agent, { cwd: dir, todoStore: { todos: [] } }).map((t) => t.name);
		expect(names).toContain("todowrite");
		expect(names).toContain("task");
		expect(names).toContain("ask_user");
		expect(names).toHaveLength(createAllTools(dir).length + 3);
	});

	it("matches the createAgent initial assembly element by element", () => {
		const dir = freshDir();
		const fromFactory = createAgent({ config: BASE_CONFIG, cwd: dir }).state.tools.map((t) => t.name);
		const agent = new Agent({ model: BASE_MODEL });
		const rebuilt = buildAgentTools(agent, { cwd: dir, todoStore: { todos: [] } }).map((t) => t.name);
		expect(rebuilt).toEqual(fromFactory);
	});

	it("rebinds relative paths when rebuilt for another directory", async () => {
		const dirA = freshDir();
		const dirB = freshDir();
		writeFileSync(join(dirA, "x.txt"), "from-a");
		writeFileSync(join(dirB, "x.txt"), "from-b");
		const agent = new Agent({ model: BASE_MODEL });
		const before = await run(readTool(buildAgentTools(agent, { cwd: dirA, todoStore: { todos: [] } })), {
			path: "x.txt",
		});
		expect(before.content).toContain("from-a");
		const after = await run(readTool(buildAgentTools(agent, { cwd: dirB, todoStore: { todos: [] } })), {
			path: "x.txt",
		});
		expect(after.content).toContain("from-b");
	});
});
