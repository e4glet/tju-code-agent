/**
 * Minimal Server-Sent Events parser. Consumes a Response body stream and
 * yields the payload of every `data:` line as an event string. `[DONE]`
 * markers are passed through (callers decide what they mean).
 *
 * A stall timeout guards against a provider connection that goes silent mid-
 * stream (no data and no close): instead of hanging forever, `readSse` throws
 * and the caller reports it as an error.
 */
const SSE_STALL_TIMEOUT_MS = 120_000;
const STALL = Symbol("stall");

async function readWithStallTimeout(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	ms: number,
): Promise<ReadableStreamReadResult<Uint8Array> | typeof STALL> {
	const readPromise = reader.read();
	// If the stall timeout wins the race we abandon this read; keep its later
	// rejection (from cancel/cleanup) from surfacing as an unhandled rejection.
	void readPromise.catch(() => {});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<typeof STALL>((resolve) => {
		timer = setTimeout(() => resolve(STALL), ms);
	});
	try {
		return await Promise.race([readPromise, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export async function* readSse(
	response: Response,
	signal?: AbortSignal,
	stallTimeoutMs: number = SSE_STALL_TIMEOUT_MS,
): AsyncGenerator<string, void, undefined> {
	if (!response.body) {
		return;
	}
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	const cleanup = () => {
		try {
			void reader.cancel().catch(() => {});
		} catch {
			// ignore
		}
	};
	const onAbort = () => cleanup();
	signal?.addEventListener("abort", onAbort, { once: true });

	try {
		while (true) {
			if (signal?.aborted) {
				return;
			}
			const result = await readWithStallTimeout(reader, stallTimeoutMs);
			if (result === STALL) {
				cleanup();
				throw new Error(
					`Provider stream stalled (no data for ${Math.round(stallTimeoutMs / 1000)}s). The connection may have dropped; retry the request.`,
				);
			}
			const { done, value } = result as ReadableStreamReadResult<Uint8Array>;
			if (done) {
				break;
			}
			buffer += decoder.decode(value, { stream: true });

			// SSE frames are separated by a blank line (`\n\n` or `\r\n\r\n`).
			const framePattern = /\r?\n\r?\n/;
			let match: RegExpExecArray | null;
			while ((match = framePattern.exec(buffer)) && match.index !== -1) {
				const frame = buffer.slice(0, match.index);
				buffer = buffer.slice(match.index + match[0].length);
				const frameWithoutEndingNl = frame.replace(/\r?\n$/, "");
				for (const line of frameWithoutEndingNl.split(/\r?\n/)) {
					if (!line.startsWith("data:")) continue;
					const data = line.slice(5).trim();
					if (data) {
						yield data;
					}
				}
			}
		}

		// Flush trailing data with no final blank line.
		if (buffer.trim()) {
			for (const line of buffer.split(/\r?\n/)) {
				if (!line.startsWith("data:")) continue;
				const data = line.slice(5).trim();
				if (data) {
					yield data;
				}
			}
		}
	} finally {
		signal?.removeEventListener("abort", onAbort);
	}
}