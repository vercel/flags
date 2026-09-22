import type { DatafileInput } from '../types';
import type { Auth } from './auth';
import { fetchDatafile } from './fetch-datafile';
import { TypedEmitter } from './typed-emitter';

export type PollingSourceConfig = {
  host: string;
  auth: Auth;
  polling: { intervalMs: number };
  fetch: typeof globalThis.fetch;
};

export type PollingSourceEvents = {
  data: (data: DatafileInput) => void;
  error: (error: Error) => void;
};

/** Shares scheduled and read-triggered polls, including their failures. */
export class PollingSource extends TypedEmitter<PollingSourceEvents> {
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private pending:
    | { abort: AbortController; promise: Promise<void> }
    | undefined;

  constructor(private config: PollingSourceConfig) {
    super();
  }

  poll(): Promise<void> {
    if (this.pending) return this.pending.promise;
    const abort = new AbortController();
    const promise = this.fetch(abort).finally(() => {
      if (this.pending?.abort === abort) this.pending = undefined;
    });
    this.pending = { abort, promise };
    return promise;
  }

  private async fetch(abort: AbortController): Promise<void> {
    let rejectAbort!: (reason: unknown) => void;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => rejectAbort(abort.signal.reason);
    abort.signal.addEventListener('abort', onAbort, { once: true });
    // Includes authentication and body parsing, even for transports ignoring abort.
    const timeout = setTimeout(
      () =>
        abort.abort(new Error('@vercel/flags-core: Poll deadline exceeded')),
      10_000,
    );
    try {
      const data = await Promise.race([
        fetchDatafile({ ...this.config, signal: abort.signal }),
        aborted,
      ]);
      abort.signal.throwIfAborted();
      this.emit('data', data);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const stopped =
        abort.signal.aborted && abort.signal.reason?.name === 'AbortError';
      if (!stopped) this.emit('error', err);
      throw err;
    } finally {
      clearTimeout(timeout);
      abort.signal.removeEventListener('abort', onAbort);
    }
  }

  startInterval(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      void this.poll().catch(() => {});
    }, this.config.polling.intervalMs);
  }

  stop(): void {
    clearInterval(this.intervalId);
    this.intervalId = undefined;
    this.pending?.abort.abort();
    this.pending = undefined;
  }
}
