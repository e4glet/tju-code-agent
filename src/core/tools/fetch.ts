import { lookup } from "node:dns/promises";
import { z } from "zod";
import type { AgentTool } from "../types.ts";

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_SECONDS = 30;
const HTML_MAX_CHARS = 20_000;

export const fetchSchema = z.object({
	url: z.string().describe("URL to fetch (http/https)"),
	maxBytes: z
		.number()
		.int()
		.positive()
		.optional()
		.describe("Optional maximum response bytes to return (default 1MB)"),
	timeout: z
		.number()
		.int()
		.positive()
		.optional()
		.describe("Optional timeout in seconds (default 30)"),
	allowPrivate: z
		.boolean()
		.optional()
		.describe(
			"Allow requests to private/loopback/link-local addresses (disabled by default for SSRF safety). " +
				"Only set true when the target is a local or internal service you intend to reach.",
		),
});

export type FetchInput = z.infer<typeof fetchSchema>;

function looksText(buffer: Uint8Array): boolean {
	for (let i = 0; i < Math.min(buffer.length, 4096); i++) {
		if (buffer[i] === 0) return false;
	}
	return true;
}

const HTML_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	middot: "·",
	mdash: "—",
	ndash: "–",
	hellip: "…",
};

function decodeHtmlEntities(text: string): string {
	return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
		if (code.startsWith("#x") || code.startsWith("#X")) {
			const value = Number.parseInt(code.slice(2), 16);
			return Number.isFinite(value) ? String.fromCodePoint(value) : match;
		}
		if (code.startsWith("#")) {
			const value = Number.parseInt(code.slice(1), 10);
			return Number.isFinite(value) ? String.fromCodePoint(value) : match;
		}
		return HTML_ENTITIES[code.toLowerCase()] ?? match;
	});
}

export function stripHtml(html: string): string {
	return decodeHtmlEntities(
		html
			.replace(/<script\b[\s\S]*?<\/script>/gi, " ")
			.replace(/<style\b[\s\S]*?<\/style>/gi, " ")
			.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
			.replace(/<!--[\s\S]*?-->/g, " ")
			.replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/header|\/footer)[^>]*>/gi, "\n"),
	)
		.replace(/<[^>]+>/g, " ")
		.replace(/[ \t\r\f\v]+/g, " ")
		.replace(/\n[ \t]+/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function looksLikeHtml(contentType: string, text: string): boolean {
	if (/html/i.test(contentType)) return true;
	const head = text.slice(0, 1000).trimStart().toLowerCase();
	return head.startsWith("<!doctype html") || head.startsWith("<html");
}

function isNonPublicIp(ip: string): boolean {
	let addr = ip.trim();
	// Normalize IPv4-mapped IPv6 (::ffff:1.2.3.4) back to IPv4.
	if (addr.startsWith("::ffff:")) addr = addr.slice(7);
	if (addr.includes(":")) {
		// IPv6: loopback, unspecified, link-local, unique-local, and IPv4-mapped.
		return (
			addr === "::1" ||
			addr === "::" ||
			addr.startsWith("fc") ||
			addr.startsWith("fd") ||
			addr.startsWith("fe8") ||
			addr.startsWith("fe9") ||
			addr.startsWith("fea") ||
			addr.startsWith("feb") ||
			addr.toLowerCase().startsWith("0:0:0:0:0:ffff:0")
		);
	}
	const parts = addr.split(".").map((n) => Number(n));
	if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
		return true; // not a valid public IPv4 literal
	}
	const [a, b] = parts as [number, number, number, number];
	if (a === 0) return true; // "this network"
	if (a === 10) return true; // RFC1918
	if (a === 127) return true; // loopback
	if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
	if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
	if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
	if (a === 192 && b === 168) return true; // RFC1918
	if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
	if (a >= 224) return true; // multicast + reserved
	return false;
}

async function resolveAddresses(url: URL): Promise<string[]> {
	try {
		const records = await lookup(url.hostname, { all: true });
		return records.map((r) => r.address);
	} catch {
		// DNS lookup failed. If the host is already an IP literal, validate it
		// directly; otherwise we cannot judge it, so allow (avoid false positives).
		const host = url.hostname.replace(/^\[|\]$/g, "");
		if (/^[\d.]+$/.test(host) || host.includes(":")) return [host];
		return [];
	}
}

/**
 * Refuse requests to non-public addresses (loopback, link-local, cloud metadata,
 * RFC1918, CGNAT, etc.) unless explicitly enabled via `allowPrivate`. This
 * mitigates SSRF: a model steered by hostile web content cannot be tricked into
 * probing the local network or cloud metadata endpoints.
 */
async function assertPublicTarget(url: URL, allowPrivate: boolean): Promise<void> {
	if (allowPrivate) return;
	const addresses = await resolveAddresses(url);
	for (const addr of addresses) {
		if (isNonPublicIp(addr)) {
			throw new Error(
				`Blocked request to non-public address (${addr}) for SSRF safety. ` +
					"Set allowPrivate: true to allow private/loopback/link-local targets.",
			);
		}
	}
}

async function readLimited(response: Response, limit: number): Promise<Uint8Array> {
	const reader = response.body?.getReader();
	if (!reader) {
		const buf = await response.arrayBuffer();
		return new Uint8Array(buf);
	}
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done || value === undefined) break;
		const remaining = limit + 1 - total;
		if (value.length <= remaining) {
			chunks.push(value);
			total += value.length;
		} else {
			chunks.push(value.subarray(0, remaining));
			total += remaining;
			break;
		}
		if (total > limit) break;
	}
	reader.releaseLock();
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out;
}

export function createFetchTool(): AgentTool<typeof fetchSchema> {
	return {
		name: "fetch",
		label: "fetch",
		description:
			"Fetch a web page or API endpoint over http(s) and return its text content. " +
			"Follows redirects. Limits response size to protect context. " +
			"Use for reading online documentation, checking API responses or scraping simple pages.",
		parameters: fetchSchema,
		promptSnippet: "fetch a URL from the internet",
		async execute(call, { url, maxBytes, timeout, allowPrivate }) {
			let parsed: URL;
			try {
				parsed = new URL(url);
			} catch {
				throw new Error(`Invalid URL: ${url}`);
			}
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				throw new Error(`Unsupported protocol: ${parsed.protocol}`);
			}
			await assertPublicTarget(parsed, allowPrivate ?? false);

			const limit = maxBytes ?? DEFAULT_MAX_BYTES;
			const timeoutMs = (timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000;

			call.onUpdate?.({ content: "【正在联网查询中】" });

			const controller = new AbortController();
			const onAbort = () => controller.abort();
			if (call.signal?.aborted) onAbort();
			else call.signal?.addEventListener("abort", onAbort, { once: true });
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			timer.unref?.();

			try {
				const response = await fetch(url, {
					signal: controller.signal,
					redirect: "follow",
					headers: { "user-agent": "tju-code/0.1.0" },
				});
				if (!response.ok) {
					throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
				}
				const contentType = response.headers.get("content-type") ?? "";
				const isText =
					/^text\//i.test(contentType) ||
					/^application\/(json|xml|javascript|x-ndjson|x-yaml|yaml|x-www-form-urlencoded)/i.test(contentType);
				const buffer = await readLimited(response, limit);
				if (!isText && !looksText(buffer)) {
					return {
						content: `[Non-text response (${contentType || "unknown content-type"}), ${buffer.length} bytes]`,
						details: { url: response.url, status: response.status, contentType, bytes: buffer.length },
					};
				}
					const text = new TextDecoder("utf-8").decode(buffer);
				const truncated = buffer.length > limit;
				const rawBody = truncated ? Array.from(text).slice(0, limit).join("") : text;

				if (looksLikeHtml(contentType, rawBody)) {
					const stripped = stripHtml(rawBody);
					const clipped = stripped.length > HTML_MAX_CHARS;
					const body = clipped ? stripped.slice(0, HTML_MAX_CHARS) : stripped;
					const note = clipped
						? `\n\n[HTML converted to text and truncated: ${stripped.length} chars total, showing first ${HTML_MAX_CHARS}. Use maxBytes or a more specific URL to read more.]`
						: "";
					return {
						content: `${body}${note}`,
						details: {
							url: response.url,
							status: response.status,
							contentType,
							bytes: buffer.length,
							truncated,
							htmlToText: true,
						},
					};
				}

				const note = truncated
					? `\n\n[Output truncated: response was ${text.length} chars, showing first ${limit}]`
					: "";
				return {
					content: `${rawBody}${note}`,
					details: {
						url: response.url,
						status: response.status,
						contentType,
						bytes: buffer.length,
						truncated,
					},
				};
			} catch (error) {
				if (call.signal?.aborted) throw new Error("Fetch aborted");
				throw error;
			} finally {
				clearTimeout(timer);
				call.signal?.removeEventListener("abort", onAbort);
			}
		},
	};
}
