import type { DatafileInput } from '../types';
import { connectStream } from './stream-connection';
import { TypedEmitter } from './typed-emitter';

export type StreamSourceConfig = {
  host: string;
  sdkKey: string;
  fetch?: typeof globalThis.fetch;
};

export type StreamSourceEvents = {
  data: (data: DatafileInput) => void;
  connected: () => void;
  disconnected: () => void;
};

/**
 * Manages a streaming connection to the flags service.
 * Wraps connectStream() and emits typed events.
 */
export class StreamSource extends TypedEmitter<StreamSourceEvents> {
  private config: StreamSourceConfig;
  private abortController: AbortController | undefined;
  private promise: Promise<void> | undefined;

  constructor(config: StreamSourceConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the stream connection.
   * Returns a promise that resolves when the first datafile message arrives.
   * If already started, returns the existing promise.
   */
  start(): Promise<void> {
    if (this.promise) return this.promise;

    const abortController = new AbortController();
    this.abortController = abortController;

    // Clear cached state when the stream terminates so that a subsequent
    // start() call creates a fresh connection instead of returning a stale
    // resolved promise.
    abortController.signal.addEventListener(
      'abort',
      () => {
        if (this.abortController === abortController) {
          this.promise = undefined;
          this.abortController = undefined;
        }
      },
      { once: true },
    );

    try {
      const promise = connectStream(
        {
          host: this.config.host,
          sdkKey: this.config.sdkKey,
          abortController,
          fetch: this.config.fetch,
        },
        {
          onMessage: (newData) => {
            this.emit('data', newData);
            this.emit('connected');
          },
          onDisconnect: () => {
            this.emit('disconnected');
          },
        },
      );

      this.promise = promise;
      return promise;
    } catch (error) {
      this.promise = undefined;
      this.abortController = undefined;
      throw error;
    }
  }

  /**
   * Stop the stream connection.
   */
  stop(): void {
    this.abortController?.abort();
    this.abortController = undefined;
    this.promise = undefined;
  }
}
