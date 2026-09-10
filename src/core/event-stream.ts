/**
 * A push-based async event stream.
 *
 * A single producer `push()`es events and finally `end()`s the stream.
 * Consumers iterate it with `for await (...)`. This is the primitive the AI
 * adapters and the agent loop both use.
 */
export class EventStream<T> implements AsyncIterable<T> {
	private buffer: T[] = [];
	private waiters: Array<(value: IteratorResult<T>) => void> = [];
	private closed = false;

	/** Push an event to the stream. Throws if the stream is already closed. */
	push(event: T): void {
		if (this.closed) {
			throw new Error("Cannot push to a closed EventStream");
		}
		const waiter = this.waiters.shift();
		if (waiter) {
			waiter({ value: event, done: false });
		} else {
			this.buffer.push(event);
		}
	}

	/** End the stream. No further events are accepted. */
	end(): void {
		this.closed = true;
		for (const waiter of this.waiters.splice(0)) {
			waiter({ value: undefined as never, done: true });
		}
	}

	get isClosed(): boolean {
		return this.closed;
	}

	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		while (true) {
			if (this.buffer.length > 0) {
				yield this.buffer.shift() as T;
			} else if (this.closed) {
				return;
			} else {
				const next = new Promise<IteratorResult<T>>((resolve) => this.waiters.push(resolve));
				const result = await next;
				if (result.done) {
					return;
				}
				yield result.value;
			}
		}
	}
}

/**
 * A convenience EventStream that resolves to a final value when ended.
 * The final value is passed explicitly via `end(value)`.
 */
export class ResultStream<T, R> implements AsyncIterable<T> {
	private stream = new EventStream<T>();
	private _result: R | undefined;
	private resultResolvers: Array<(r: R | undefined) => void> = [];

	push(event: T): void {
		this.stream.push(event);
	}

	end(result?: R): void {
		this._result = result;
		this.stream.end();
		for (const resolve of this.resultResolvers.splice(0)) {
			resolve(this._result);
		}
	}

	/** Resolve to the value passed to `end()` once the stream completes. */
	result(): Promise<R | undefined> {
		if (this.stream.isClosed) {
			return Promise.resolve(this._result);
		}
		return new Promise((resolve) => {
			this.resultResolvers.push(resolve);
		});
	}

	async *[Symbol.asyncIterator](): AsyncIterator<Awaited<T>> {
		for await (const event of this.stream) {
			yield event as Awaited<T>;
		}
	}
}