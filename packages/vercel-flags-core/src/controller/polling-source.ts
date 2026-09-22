import type { DatafileInput } from '../types';
import type { Auth } from './auth';
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
  private promise: Promise<boolean> | undefined;

  constructor(config: PollingSourceConfig) {
    super();
    this.config = config;
  }

  /**
   * Perform a single poll request.
   * Emits 'data' on success, 'error' on failure.
   */
  poll(): Promise<boolean> {
    if (this.promise) return this.promise;
    const abortController = new AbortController();
    this.abortController = abortController;
    this.promise = fetchDatafile({
      ...this.config,
      signal: abortController.signal,
    })
      .then((data) => {
        abortController.signal.throwIfAborted();
        this.emit('data', data);
        return true;
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
          this.emit(
            'error',
            error instanceof Error ? error : new Error('Unknown poll error'),
          );
        }
        return false;
      })
      .finally(() => {
        if (this.abortController === abortController) {
          this.promise = undefined;
          this.abortController = undefined;
        }
      });
    return this.promise;
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
    this.promise = undefined;
  }
}
