import { lookup } from "node:dns/promises";
import { z } from "zod";
import { isLoopbackHost } from "../permission.ts";
import type { AgentTool } from "../types.ts";
import { APP_VERSION } from "../../version.ts";

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
			"Allow requests to private/link-local addresses (disabled by default for SSRF safety). " +
				"Loopback targets are never allowed through this tool; use bash instead. " +
				"Only set true when the target is a local or internal service you intend to reach.",
		),
});

export type FetchInput = z.infer<typeof fetchSchema>;

function errorCauseChain(error: unknown): string {
	const parts: string[] = [];
	let current = error;
	for (let i = 0; i < 3 && current instanceof Error; i++) {
		if (current.message && !parts.includes(current.message)) parts.push(current.message);
		current = (current as { cause?: unknown }).cause;
	}
	return parts.length > 0 ? parts.join(" <- ") : String(error);
}

export function describeFetchError(url: string, error: unknown): string {
	return `Failed to fetch ${url}: ${errorCauseChain(error)}`;
}

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

/** Parse a dotted-quad into its four octets (null when it is not one). */
function parseIpv4(addr: string): number[] | null {
	const parts = addr.split(".");
	if (parts.length !== 4) return null;
	const octets: number[] = [];
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		const value = Number(part);
		if (value > 255) return null;
		octets.push(value);
	}
	return octets;
}

/**
 * Expand an IPv6 literal into its eight 16-bit groups (null when unparseable).
 * Parsing structurally matters: the previous string-prefix check treated
 * `::ffff:7f00:1` (the hex spelling of 127.0.0.1) and `::ffff:a9fe:a9fe`
 * (169.254.169.254) as public, so any resolver that returned those forms would
 * have walked straight past the guard.
 */
function parseIpv6(addr: string): number[] | null {
	let text = addr.trim().toLowerCase();
	const zone = text.indexOf("%");
	if (zone !== -1) text = text.slice(0, zone); // strip scope id (fe80::1%eth0)
	if (text.includes(".")) {
		// A trailing dotted-quad (::ffff:1.2.3.4) becomes two groups.
		const lastColon = text.lastIndexOf(":");
		const tail = parseIpv4(text.slice(lastColon + 1));
		if (!tail) return null;
		const high = ((tail[0] ?? 0) << 8) | (tail[1] ?? 0);
		const low = ((tail[2] ?? 0) << 8) | (tail[3] ?? 0);
		text = `${text.slice(0, lastColon + 1)}${high.toString(16)}:${low.toString(16)}`;
	}
	if ((text.match(/::/g) ?? []).length > 1) return null;
	const hasGap = text.includes("::");
	const [headText, tailText] = hasGap ? text.split("::") : [text, undefined];
	const split = (part: string): number[] | null => {
		if (!part) return [];
		const groups: number[] = [];
		for (const piece of part.split(":")) {
			if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
			groups.push(Number.parseInt(piece, 16));
		}
		return groups;
	};
	const head = split(headText ?? "");
	const tail = hasGap ? split(tailText ?? "") : [];
	if (!head || !tail) return null;
	if (!hasGap) return head.length === 8 ? head : null;
	const missing = 8 - head.length - tail.length;
	if (missing < 0) return null;
	return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

/** True unless the address is a routable public one. */
function isNonPublicIp(ip: string): boolean {
	const addr = ip.trim().replace(/^\[|\]$/g, "");

	if (addr.includes(":")) {
		const groups = parseIpv6(addr);
		if (!groups || groups.length !== 8) return true; // unparseable: refuse
		const bytes = groups.flatMap((g) => [(g >> 8) & 0xff, g & 0xff]);
		if (bytes.every((b) => b === 0)) return true; // :: (unspecified)
		if (bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1) return true; // ::1 loopback

		// Addresses that carry an embedded IPv4 in their low 32 bits — the
		// IPv4-compatible `::a.b.c.d`, the IPv4-mapped `::ffff:a.b.c.d`, and the
		// IPv4-translated `::ffff:0:a.b.c.d` that Node's URL/lookup path produces
		// for mapped literals — are judged by that IPv4 address. Matching on the
		// byte layout rather than a string prefix is what makes `::ffff:7f00:1`
		// and `::ffff:0:7f00:1` resolve to 127.0.0.1 instead of slipping through.
		const compatible = bytes.slice(0, 12).every((b) => b === 0);
		const mapped = bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
		const translated = bytes.slice(0, 8).every((b) => b === 0) && bytes[8] === 0xff && bytes[9] === 0xff;
		if (compatible || mapped || translated) {
			return isNonPublicIp(bytes.slice(12).join("."));
		}
		// NAT64 well-known prefix 64:ff9b::/96 embeds an IPv4 address too.
		if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && bytes.slice(4, 12).every((b) => b === 0)) {
			return isNonPublicIp(bytes.slice(12).join("."));
		}
		const g0 = groups[0] ?? 0;
		const g1 = groups[1] ?? 0;
		if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
		if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
		if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
		if (g0 === 0x2001 && g1 === 0x0db8) return true; // 2001:db8::/32 documentation
		return false;
	}

	const octets = parseIpv4(addr);
	if (!octets) return true; // not a valid IPv4 literal
	const [a, b] = octets as [number, number, number, number];
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
 *
 * Loopback is always refused, even with `allowPrivate`: the approval gate owns
 * loopback decisions for bash, while this tool offers no consent path, so an
 * override here would be a silent self-attack primitive against anything bound
 * to localhost (including this GUI backend itself).
 */
function isLoopbackAddress(addr: string): boolean {
	const ip = addr.trim().replace(/^\[|\]$/g, "");
	if (!ip.includes(":")) {
		const octets = parseIpv4(ip);
		return !!octets && octets[0] === 127;
	}
	const groups = parseIpv6(ip);
	if (!groups || groups.length !== 8) return false;
	const bytes = groups.flatMap((g) => [(g >> 8) & 0xff, g & 0xff]);
	if (bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1) return true;
	const embedded =
		bytes.slice(0, 12).every((b) => b === 0) ||
		(bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff) ||
		(bytes.slice(0, 8).every((b) => b === 0) && bytes[8] === 0xff && bytes[9] === 0xff) ||
		(bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && bytes.slice(4, 12).every((b) => b === 0));
	if (embedded) return isLoopbackAddress(bytes.slice(12).join("."));
	return false;
}

async function assertPublicTarget(url: URL, allowPrivate: boolean): Promise<void> {
	if (isLoopbackHost(url.hostname)) {
		throw new Error(
			`Blocked request to loopback address (${url.hostname}) for SSRF safety. ` +
				"Loopback targets are never fetchable through this tool; use bash instead.",
		);
	}
	const addresses = await resolveAddresses(url);
	for (const addr of addresses) {
		if (isLoopbackAddress(addr)) {
			throw new Error(
				`Blocked request to loopback address (${addr}) for SSRF safety. ` +
					"Loopback targets are never fetchable through this tool; use bash instead.",
			);
		}
	}
	if (allowPrivate) return;
	for (const addr of addresses) {
		if (isNonPublicIp(addr)) {
			throw new Error(
				`Blocked request to non-public address (${addr}) for SSRF safety. ` +
					"Set allowPrivate: true to allow private/loopback/link-local targets.",
			);
		}
	}
}

/**
 * Fetch while validating every hop. A single check of the URL the model passed
 * is not enough: `redirect: "follow"` lets the remote side bounce the request to
 * 127.0.0.1 (or any intranet host) after the guard has already returned, which
 * defeats the SSRF protection entirely. So redirects are followed manually and
 * each hop is re-validated before it is requested.
 */
const MAX_REDIRECTS = 5;

async function fetchPublic(
	startUrl: string,
	allowPrivate: boolean,
	signal: AbortSignal,
): Promise<Response> {
	let current = startUrl;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		const url = new URL(current);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new Error(`Unsupported protocol: ${url.protocol}`);
		}
		await assertPublicTarget(url, allowPrivate);
		const response = await fetch(url, {
			signal,
			redirect: "manual",
			headers: { "user-agent": `tju-code/${APP_VERSION}` },
		});
		const location = response.headers.get("location");
		if (response.status < 300 || response.status >= 400 || !location) return response;
		// Drain redirect bodies so the socket is released before the next hop.
		await response.body?.cancel().catch(() => {});
		current = new URL(location, url).toString();
	}
	throw new Error(`Too many redirects (more than ${MAX_REDIRECTS})`);
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
				// fetchPublic re-validates the target on the initial URL and on
				// every redirect hop (see there for why one check is not enough).
				const response = await fetchPublic(url, allowPrivate ?? false, controller.signal);
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
				if (error instanceof Error && error.message.startsWith("HTTP ")) throw error;
				throw new Error(describeFetchError(url, error));
			} finally {
				clearTimeout(timer);
				call.signal?.removeEventListener("abort", onAbort);
			}
		},
	};
}
