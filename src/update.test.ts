import { describe, expect, it } from "vitest";
import { buildWindowsRelaunchArgs } from "./update.ts";

describe("buildWindowsRelaunchArgs", () => {
	it("passes exe and cli paths bare so spawn quotes exactly once", () => {
		const args = buildWindowsRelaunchArgs("C:\\Program Files\\nodejs\\node.exe", "D:\\app\\dist\\cli.js");
		expect(args).toEqual([
			"/d",
			"/s",
			"/c",
			"start",
			"Tju code",
			"C:\\Program Files\\nodejs\\node.exe",
			"D:\\app\\dist\\cli.js",
		]);
	});

	it("never embeds quotes in the trusted paths", () => {
		const args = buildWindowsRelaunchArgs("C:\\Program Files\\nodejs\\node.exe", "D:\\my dir\\dist\\cli.js");
		for (const entry of args.slice(5)) {
			expect(entry).not.toContain('"');
		}
	});
});
