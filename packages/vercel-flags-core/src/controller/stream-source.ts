import type { DatafileInput } from '../types';
import type { CacheAssessment, CacheMetadata } from './datafile-cache';
import { DEFAULT_FETCH_TIMEOUT_MS } from './fetch-datafile';
import type { NormalizedOptions } from './normalized-options';
import {
  connectStream,
  PING_MS,
  type PrimedMessage,
} from './stream-connection';
import { TypedEmitter } from './typed-emitter';

/** Pings arrive every 30s; tolerate one missed ping before revalidating. */
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
  private reconnect: (() => void) | undefined;
  private connectionStartedAt = 0;
  private revalidation:
    | { promise: Promise<void>; fail: (error: Error) => void }
    | undefined;

  constructor(options: NormalizedOptions, revision: () => number | undefined) {
    super();
    this.options = options;
    this.revision = revision;
  }

  /** Age after which reads revalidate in the background. */
  get staleAfterMs(): number {
    return STREAM_FRESH_MS;
  }

  /** Age after which reads block on a refresh. */
  get expiresAfterMs(): number {
    return STREAM_FRESH_MS + this.options.staleWhileRevalidateMs;
  }

  /** The connection loop is connecting or connected; false once it gave up or was stopped. */
  get active(): boolean {
    return this.abortController !== undefined;
  }

  /**
   * Drops a connection that has been silent beyond the fresh window and
   * resolves once the stream delivers any message, which confirms or replaces
   * the cache through the usual events. A younger connection, such as the
   * replacement a ping timeout just opened, is kept and awaited instead.
   * Rejects when the stream disconnects, gives up, is stopped, or stays silent
   * for the fetch deadline. Concurrent callers share one wait.
   */
  revalidate(): Promise<void> {
    if (this.revalidation) {
      return this.revalidation.promise;
    }
    if (!this.active) {
      return Promise.reject(new Error('stream: not active'));
    }
    let cleanup = (): void => {};
    let fail = (_error: Error): void => {};
    const promise = new Promise<void>((resolve, reject) => {
      const confirmed = (): void => {
        cleanup();
        resolve();
      };
      fail = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const interrupted = (): void => {
        fail(new Error('stream: revalidation interrupted'));
      };
      const timer = setTimeout(() => {
        fail(new Error('stream: revalidation timed out'));
      }, DEFAULT_FETCH_TIMEOUT_MS);
      cleanup = (): void => {
        clearTimeout(timer);
        this.off('data', confirmed);
        this.off('primed', confirmed);
        this.off('ping', confirmed);
        this.off('disconnected', interrupted);
        this.off('exhausted', interrupted);
      };
      this.on('data', confirmed);
      this.on('primed', confirmed);
      this.on('ping', confirmed);
      this.on('disconnected', interrupted);
      this.on('exhausted', interrupted);
    });
    const revalidation = { promise, fail };
    this.revalidation = revalidation;
    void promise
      .catch(() => {})
      .finally(() => {
        if (this.revalidation === revalidation) {
          this.revalidation = undefined;
        }
      });
    if (Date.now() - this.connectionStartedAt >= STREAM_FRESH_MS) {
      this.reconnect?.();
    }
    return promise;
  }

  assess = ({ ageMs }: Pick<CacheMetadata, 'ageMs'>): CacheAssessment => {
    if (ageMs === Infinity) {
      // Nothing has confirmed this entry yet; keep serving it until the stream does.
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
          onConnection: (reconnect) => {
            this.reconnect = reconnect;
            this.connectionStartedAt = Date.now();
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
    const abortController = this.abortController;
    this.abortController = undefined;
    this.promise = undefined;
    this.reconnect = undefined;
    this.revalidation?.fail(new Error('stream: stopped'));
    abortController?.abort();
  }
}
