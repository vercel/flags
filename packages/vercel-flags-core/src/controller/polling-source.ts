import type { DatafileInput } from '../types';
import { fetchDatafile } from './fetch-datafile';
import { TypedEmitter } from './typed-emitter';

export type PollingSourceConfig = {
  host: string;
  sdkKey: string;
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

  constructor(config: PollingSourceConfig) {
    super();
    this.config = config;
  }

  /**
   * Perform a single poll request.
   * Emits 'data' on success, 'error' on failure.
   */
  async poll(): Promise<void> {
    if (this.abortController?.signal.aborted) return;

    try {
      const data = await fetchDatafile(this.config);
      this.emit('data', data);
    } catch (error) {
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
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.abortController?.abort();
    this.abortController = undefined;
  }
}
