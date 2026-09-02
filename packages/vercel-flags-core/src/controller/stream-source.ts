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
/**
 * Per-connection state read from the Controller. Each getter is invoked on
 * every connection attempt so reconnects reflect the latest state.
 */
export type StreamSourceHooks = {
  /** Current revision, sent as X-Revision. */
  revision: () => number | undefined;
  /** Current `configUpdatedAt`, sent as X-Config-Updated-At. */
  configUpdatedAt?: () => number | undefined;
  /** Minimum required `configUpdatedAt`, sent as X-Config-Min-Updated-At. */
  minUpdatedAt?: () => number | undefined;
  /** Whether the state after a message is fresh enough to resolve init. */
  canResolveInit?: () => boolean;
};

export class StreamSource extends TypedEmitter<StreamSourceEvents> {
  private options: NormalizedOptions;
  private hooks: StreamSourceHooks;
  private abortController: AbortController | undefined;
  private promise: Promise<void> | undefined;

  constructor(options: NormalizedOptions, hooks: StreamSourceHooks) {
    super();
    this.options = options;
    this.hooks = hooks;
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
          resolveToken: () => this.options.auth.resolveToken(),
          abortController,
          fetch: this.options.fetch,
          revision: this.hooks.revision,
          configUpdatedAt: this.hooks.configUpdatedAt,
          minUpdatedAt: this.hooks.minUpdatedAt,
          canResolveInit: this.hooks.canResolveInit,
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
