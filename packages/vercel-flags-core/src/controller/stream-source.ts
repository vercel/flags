import type { DatafileInput } from '../types';
import type { CacheAssessment, CacheMetadata } from './datafile-cache';
import { debug } from './debug';
import type { NormalizedOptions } from './normalized-options';
import {
  connectStream,
  PING_MS,
  type PrimedMessage,
} from './stream-connection';
import { TypedEmitter } from './typed-emitter';

/** Pings arrive every 30s; data older than one missed ping is reported stale. */
export const STREAM_FRESH_MS = PING_MS * 2;

export type StreamSourceEvents = {
  data: (data: DatafileInput) => void;
  primed: (message: PrimedMessage) => void;
  ping: () => void;
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  /** The connection loop gave up (retries exhausted, 401, or token failure). */
  exhausted: () => void;
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

  /** Age after which reads report the cache as stale. */
  get staleAfterMs(): number {
    return STREAM_FRESH_MS;
  }

  /** The connection loop is connecting or connected; false once it gave up or was stopped. */
  get active(): boolean {
    return this.abortController !== undefined;
  }

  assess = ({ ageMs }: Pick<CacheMetadata, 'ageMs'>): CacheAssessment => {
    if (ageMs === Infinity) {
      // Nothing has confirmed this entry yet; keep serving it until the stream does.
      return { status: 'unknown' };
    }
    if (ageMs <= this.staleAfterMs) {
      return { status: 'fresh' };
    }
    // The stream recovers on its own (ping watchdog, reconnects, fallback when
    // it gives up), so silence never makes a read wait; it only labels the data.
    return { status: 'stale' };
  };

  /**
   * Start the stream connection.
   * Returns a promise that resolves when the first datafile or primed message arrives.
   * If already started, returns the existing promise.
   */
  start(): Promise<void> {
    if (this.promise) return this.promise;

    debug(this.options.clientName, 'stream.start', () => ({
      revision: this.revision(),
      staleAfterMs: this.staleAfterMs,
    }));
    const abortController = new AbortController();
    this.abortController = abortController;

    // Clear cached state when the stream terminates so that a subsequent
    // start() call creates a fresh connection instead of returning a stale
    // resolved promise. stop() clears the fields first, so reaching this
    // listener with them still set means the connection loop gave up itself.
    abortController.signal.addEventListener(
      'abort',
      () => {
        if (this.abortController === abortController) {
          this.promise = undefined;
          this.abortController = undefined;
          this.emit('exhausted');
        }
      },
      { once: true },
    );

    try {
      const promise = connectStream(
        {
          host: this.options.host,
          clientName: this.options.clientName,
          resolveToken: () => this.options.auth.resolveToken(),
          sourceProjectId: this.options.auth.sourceProjectId,
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
          onPing: () => this.emit('ping'),
          onDisconnect: () => {
            this.emit('disconnected');
          },
          onError: (error) => {
            this.emit('error', error);
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
    if (this.abortController) {
      debug(this.options.clientName, 'stream.stop');
    }
    const abortController = this.abortController;
    this.abortController = undefined;
    this.promise = undefined;
    abortController?.abort();
  }
}
