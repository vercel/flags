import type { DatafileInput } from '../types';
import type { Auth } from './auth';
import type { CacheMetadata, Freshness } from './datafile-cache';
import { type DebugLogger, noopDebug } from './debug';
import { fetchDatafile } from './fetch-datafile';
import { TypedEmitter } from './typed-emitter';

export type PollingSourceConfig = {
  host: string;
  auth: Auth;
  polling: {
    intervalMs: number;
  };
  fetch: typeof globalThis.fetch;
};

export type PollingSourceEvents = {
  data: (data: DatafileInput) => void;
  error: (error: Error) => void;
};

/**
 * Manages interval-based polling for flag data.
 * Wraps fetchDatafile() and emits typed events.
 */
export class PollingSource extends TypedEmitter<PollingSourceEvents> {
  private config: PollingSourceConfig;
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private abortController: AbortController | undefined;

  constructor(
    config: PollingSourceConfig,
    private readonly debug: DebugLogger = noopDebug,
  ) {
    super();
    this.config = config;
  }

  getStatus = ({ ageMs }: Pick<CacheMetadata, 'ageMs'>): Freshness =>
    ageMs <= this.config.polling.intervalMs ? 'fresh' : 'stale';

  /**
   * Perform a single poll request.
   * Emits 'data' on success, 'error' on failure.
   */
  async poll(): Promise<void> {
    if (this.abortController?.signal.aborted) return;

    this.debug('poll.start');
    try {
      const data = await fetchDatafile({
        ...this.config,
        debug: this.debug,
        signal: this.abortController?.signal,
      });
      this.debug('poll.complete');
      this.emit('data', data);
    } catch (error) {
      this.debug('poll.failed');
      const err =
        error instanceof Error ? error : new Error('Unknown poll error');
      this.emit('error', err);
    }
  }

  /**
   * Start interval-based polling.
   * Polls at the configured interval. Does not perform an initial poll —
   * callers should call poll() first if an immediate poll is needed.
   */
  startInterval(): void {
    if (this.intervalId) return;

    this.debug('poll.interval.start', () => ({
      intervalMs: this.config.polling.intervalMs,
    }));
    this.abortController = new AbortController();

    // Start interval
    this.intervalId = setInterval(
      () => void this.poll(),
      this.config.polling.intervalMs,
    );
  }

  /**
   * Stop interval-based polling.
   */
  stop(): void {
    this.debug('poll.stop');
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.abortController?.abort();
    this.abortController = undefined;
  }
}
