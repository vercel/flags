import type { CacheAssessment, CacheMetadata } from './datafile-cache';
import { DEFAULT_FETCH_TIMEOUT_MS } from './fetch-datafile';
import { TypedEmitter } from './typed-emitter';

export type PollingSourceConfig = {
  polling: {
    intervalMs: number;
  };
  staleWhileRevalidateMs: number;
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

  /** Allow the scheduled poll its entire fetch deadline before revalidating. */
  get staleAfterMs(): number {
    return this.config.polling.intervalMs + DEFAULT_FETCH_TIMEOUT_MS;
  }

  /** Age after which reads block on a refresh. */
  get expiresAfterMs(): number {
    return this.staleAfterMs + this.config.staleWhileRevalidateMs;
  }

  assess = ({ ageMs }: Pick<CacheMetadata, 'ageMs'>): CacheAssessment => {
    if (ageMs === Infinity) {
      // Nothing has confirmed this entry yet; keep serving it until a poll does.
      return { status: 'unknown' };
    }
    if (ageMs <= this.staleAfterMs) {
      return { status: 'fresh' };
    }
    if (ageMs <= this.expiresAfterMs) {
      return { status: 'stale' };
    }
    return { status: 'expired' };
  };

  /**
   * Perform a single poll request.
   * Updates the cache on success; emits 'error' and rejects on failure.
   */
  async poll(): Promise<void> {
    if (this.polling) return this.polling;
    if (this.abortController?.signal.aborted) return;
    this.abortController ??= new AbortController();
    const controller = this.abortController;

    this.polling = (async () => {
      try {
        await this.config.refresh();
        controller.signal.throwIfAborted();
      } catch (error) {
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
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.abortController?.abort();
    this.abortController = undefined;
    this.polling = undefined;
  }
}
