import type { DatafileInput } from '../types';
import type { NormalizedOptions } from './normalized-options';
import { connectStream, type PrimedMessage } from './stream-connection';
import { TypedEmitter } from './typed-emitter';

export type StreamSourceEvents = {
  data: (data: DatafileInput) => void;
  primed: (message: PrimedMessage) => void;
  connected: () => void;
  disconnected: () => void;
};

/**
 * Manages a streaming connection to the flags service.
 * Wraps connectStream() and emits typed events.
 */
export class StreamSource extends TypedEmitter<StreamSourceEvents> {
  private options: NormalizedOptions;
  private revision: () => number | undefined;
  private abortController: AbortController | undefined;
  private promise: Promise<void> | undefined;

  constructor(options: NormalizedOptions, revision: () => number | undefined) {
    super();
    this.options = options;
    this.revision = revision;
  }

  /**
   * Start the stream connection.
   * Returns a promise that resolves when the first datafile or primed message arrives.
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
          host: this.options.host,
          sdkKey: this.options.sdkKey,
          abortController,
          fetch: this.options.fetch,
          revision: this.revision,
        },
        {
          onDatafile: (newData) => {
            this.emit('data', newData);
            this.emit('connected');
          },
          onPrimed: (message) => {
            this.emit('primed', message);
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
