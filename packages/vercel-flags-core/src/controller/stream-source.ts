import type { DatafileInput } from '../types';
import { debugLog } from '../utils/debug';
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
    if (this.promise) {
      debugLog('stream-source', 'Reusing stream connection');
      return this.promise;
    }

    debugLog('stream-source', 'Starting stream connection');
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
          revision: this.revision,
        },
        {
          onDatafile: (newData) => {
            debugLog('stream-source', 'Connected with datafile', {
              projectId: newData.projectId,
              configUpdatedAt: Number(newData.configUpdatedAt),
              revision: newData.revision,
            });
            this.emit('data', newData);
            this.emit('connected');
          },
          onPrimed: (message) => {
            debugLog('stream-source', 'Connected with current revision', {
              projectId: message.projectId,
              revision: message.revision,
            });
            this.emit('primed', message);
            this.emit('connected');
          },
          onDisconnect: () => {
            debugLog('stream-source', 'Disconnected', {
              aborted: abortController.signal.aborted,
            });
            this.emit('disconnected');
          },
        },
      );

      this.promise = promise.catch((error) => {
        debugLog('stream-source', 'Stream initialization failed', {
          aborted: abortController.signal.aborted,
        });
        throw error;
      });
      return this.promise;
    } catch (error) {
      debugLog('stream-source', 'Stream initialization failed', {
        aborted: abortController.signal.aborted,
      });
      this.promise = undefined;
      this.abortController = undefined;
      throw error;
    }
  }

  /**
   * Stop the stream connection.
   */
  stop(): void {
    debugLog('stream-source', 'Stopping stream connection', {
      active: this.abortController !== undefined,
    });
    this.abortController?.abort();
    this.abortController = undefined;
    this.promise = undefined;
  }
}
