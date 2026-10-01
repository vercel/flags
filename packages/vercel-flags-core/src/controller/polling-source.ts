import type { CacheAssessment, CacheMetadata } from './datafile-cache';
import { debug } from './debug';
import { DEFAULT_FETCH_TIMEOUT_MS } from './fetch-datafile';
import { TypedEmitter } from './typed-emitter';

export type PollingSourceConfig = {
  clientName?: string;
  polling: {
    intervalMs: number;
  };
  refresh: () => Promise<void>;
};

export type PollingSourceEvents = {
  error: (error: Error) => void;
};

/**
 * Manages interval-based polling for flag data.
 * Shares the cache's HTTP refresh and emits errors.
 */
export class PollingSource extends TypedEmitter<PollingSourceEvents> {
  private config: PollingSourceConfig;
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private abortController: AbortController | undefined;
  private polling: Promise<void> | undefined;

  constructor(config: PollingSourceConfig) {
    super();
    this.config = config;
  }

  assess = ({ ageMs }: Pick<CacheMetadata, 'ageMs'>): CacheAssessment => {
    // Allow the scheduled poll its entire fetch deadline before revalidating.
    const staleAt = this.config.polling.intervalMs + DEFAULT_FETCH_TIMEOUT_MS;
    if (ageMs <= staleAt) {
      return { status: 'fresh' };
    }

    // Give the next scheduled poll a chance before making reads block.
    const expiresAt = staleAt + this.config.polling.intervalMs;
    if (ageMs <= expiresAt) {
      return { status: 'stale' };
    }

    return { status: 'expired' };
  };

  /**
   * Perform a single poll request.
   * Updates the cache on success; emits 'error' and rejects on failure.
   */
  async poll(): Promise<void> {
    if (this.polling) {
      debug(this.config.clientName, 'poll.shared');
      return this.polling;
    }
    if (this.abortController?.signal.aborted) return;
    this.abortController ??= new AbortController();
    const controller = this.abortController;

    debug(this.config.clientName, 'poll.start');
    this.polling = (async () => {
      try {
        await this.config.refresh();
        controller.signal.throwIfAborted();
        debug(this.config.clientName, 'poll.complete');
      } catch (error) {
        debug(
          this.config.clientName,
          controller.signal.aborted ? 'poll.aborted' : 'poll.failed',
        );
        controller.signal.throwIfAborted();
        const err =
          error instanceof Error ? error : new Error('Unknown poll error');
        this.emit('error', err);
        throw err;
      }
    })().finally(() => {
      if (this.abortController === controller) this.polling = undefined;
    });
    return this.polling;
  }

  /**
   * Start interval-based polling.
   * Polls at the configured interval. Does not perform an initial poll —
   * callers should call poll() first if an immediate poll is needed.
   */
  startInterval(): void {
    if (this.intervalId) return;

    debug(this.config.clientName, 'poll.interval.start', () => ({
      intervalMs: this.config.polling.intervalMs,
      staleAfterMs: this.config.polling.intervalMs + DEFAULT_FETCH_TIMEOUT_MS,
      expiresAfterMs:
        2 * this.config.polling.intervalMs + DEFAULT_FETCH_TIMEOUT_MS,
    }));
    // Start interval
    this.intervalId = setInterval(
      () => void this.poll().catch(() => {}),
      this.config.polling.intervalMs,
    );
  }

  /**
   * Stop interval-based polling.
   */
  stop(): void {
    if (this.intervalId || this.polling) {
      debug(this.config.clientName, 'poll.stop', () => ({
        pendingPoll: this.polling !== undefined,
      }));
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.abortController?.abort();
    this.abortController = undefined;
    this.polling = undefined;
  }
}
