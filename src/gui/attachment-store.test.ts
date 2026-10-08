import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AttachmentStore } from "./attachment-store.ts";

const dirs: string[] = [];

afterEach(() => {
	while (dirs.length) {
		const dir = dirs.pop();
		if (dir) rmSync(dir, { recursive: true, force: true });
	}
});

describe("AttachmentStore concurrent saves", () => {
	it("keeps every entry when uploads race", async () => {
		const root = mkdtempSync(join(tmpdir(), "tju-attach-"));
		dirs.push(root);
		const store = new AttachmentStore(root);
		const saved = await Promise.all(
			[1, 2, 3, 4, 5].map((i) =>
				store.save("work-1", { name: `img-${i}.png`, mime: "image/png", kind: "image" }, new Uint8Array([i])),
			),
		);
		expect(new Set(saved.map((a) => a.id)).size).toBe(5);
		for (const a of saved) {
			const meta = await store.getMeta("work-1", a.id);
			expect(meta?.name).toBe(a.name);
			expect(Array.from((await store.readBytes("work-1", a.id)) ?? [])).toEqual([Number(a.name.slice(4, 5))]);
		}
		expect(await store.listIds("work-1")).toHaveLength(5);
	});
});
