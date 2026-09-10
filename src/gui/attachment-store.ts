import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Attachment, AttachmentKind } from "../core/types.ts";

/**
 * On-disk store for files attached to GUI conversation messages (images).
 *
 * Layout:
 *   <root>/<workId>/<id>            raw file bytes
 *   <root>/<workId>/.index.json     id -> Attachment metadata
 *
 * Only lightweight metadata (id/name/mime/size/kind) is carried inside the
 * transcript; the bytes live here and are resolved lazily by the provider
 * adapter when a request is sent. Deleting a work item removes its folder.
 */
export class AttachmentStore {
	readonly root: string;

	constructor(root: string) {
		this.root = root;
	}

	/** Absolute path of one work item's attachment directory. */
	workDir(workId: string): string {
		return join(this.root, workId);
	}

	filePath(workId: string, id: string): string {
		return join(this.workDir(workId), id);
	}

	indexPath(workId: string): string {
		return join(this.workDir(workId), ".index.json");
	}

	async loadIndex(workId: string): Promise<Record<string, Attachment>> {
		try {
			const raw = await readFile(this.indexPath(workId), "utf-8");
			const parsed = JSON.parse(raw) as Record<string, Attachment>;
			return parsed && typeof parsed === "object" ? parsed : {};
		} catch {
			return {};
		}
	}

	private async saveIndex(workId: string, index: Record<string, Attachment>): Promise<void> {
		await mkdir(this.workDir(workId), { recursive: true });
		await writeFile(this.indexPath(workId), JSON.stringify(index), "utf-8");
	}

	/** Store raw bytes and return the new attachment reference. */
	async save(
		workId: string,
		meta: { name: string; mime: string; kind: AttachmentKind },
		bytes: Uint8Array,
	): Promise<Attachment> {
		const id = randomBytes(12).toString("hex");
		const attachment: Attachment = {
			id,
			name: meta.name || "attachment",
			mime: meta.mime || "application/octet-stream",
			size: bytes.byteLength,
			kind: meta.kind,
		};
		await mkdir(this.workDir(workId), { recursive: true });
		await writeFile(this.filePath(workId, id), bytes);
		const index = await this.loadIndex(workId);
		index[id] = attachment;
		await this.saveIndex(workId, index);
		return attachment;
	}

	/** Read a stored attachment's bytes by id (null when missing). */
	async readBytes(workId: string, id: string): Promise<Uint8Array | null> {
		if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) return null;
		try {
			return await readFile(this.filePath(workId, id));
		} catch {
			return null;
		}
	}

	/** Fetch a stored attachment's metadata by id (null when missing). */
	async getMeta(workId: string, id: string): Promise<Attachment | null> {
		const index = await this.loadIndex(workId);
		const meta = index[id];
		if (!meta) return null;
		const bytes = await this.readBytes(workId, id);
		if (!bytes) return null;
		return { ...meta, size: bytes.byteLength };
	}

	/** All attachment ids currently stored for a work item. */
	async listIds(workId: string): Promise<string[]> {
		try {
			const entries = await readdir(this.workDir(workId), { withFileTypes: true });
			return entries
				.filter((e) => e.isFile() && !e.name.startsWith("."))
				.map((e) => e.name);
		} catch {
			return [];
		}
	}

	/** Remove every file belonging to a work item. */
	async removeWork(workId: string): Promise<void> {
		await rm(this.workDir(workId), { recursive: true, force: true }).catch(() => {});
	}
}
