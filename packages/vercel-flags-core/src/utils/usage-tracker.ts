import { waitUntil } from '@vercel/functions';
import { version } from '../../package.json';

const MAX_EVENTS_PER_BATCH = 2000; // 2000 events is <1MB
const MAX_BATCH_WAIT_MS = 5_000; // 5 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 100;

const isDebugMode = process.env.DEBUG?.includes('@vercel/flags-core');

const debugLog = (...args: any[]) => {
  if (isDebugMode) {
    console.log(...args);
  }
};

export interface FlagsConfigReadEvent {
  type: 'FLAGS_CONFIG_READ';
  ts: number;
  payload: {
    deploymentId?: string;
    region?: string;
    invocationHost?: string;
    vercelRequestId?: string;
    cacheStatus?: 'HIT' | 'MISS';
    cacheIsBlocking?: boolean;
    cacheIsFirstRead?: boolean;
    duration?: number;
    configUpdatedAt?: number;
    configOrigin?: 'in-memory' | 'embedded';
  };
}

// WeakSet to track request contexts that have already been recorded
// Using WeakSet allows the context objects to be garbage collected
const trackedRequests = new WeakSet<object>();

interface RequestContext {
  ctx: object | undefined;
  headers: Record<string, string> | undefined;
}

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
const fromSymbol = globalThis as typeof globalThis & {
  [key: symbol]:
    | { get?: () => { headers?: Record<string, string> } }
    | undefined;
};

/**
 * Gets the Vercel request context and headers from the global symbol.
 */
function getRequestContext(): RequestContext {
  try {
    const ctx = fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.();
    if (ctx && Object.hasOwn(ctx, 'headers')) {
      return {
        ctx,
        headers: ctx.headers as Record<string, string>,
      };
    }
    return { ctx, headers: undefined };
  } catch {
    return { ctx: undefined, headers: undefined };
  }
}

/**
 * Returns a promise that resolves after the specified delay.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Function to create a timeout that can await its callback
 * or be cleared by also cleaning up the dangling promise.
 */
function createAsyncTimeout(cb: () => Promise<void>, delay: number) {
  let resolve: () => void = () => void 0;

  const timer = setTimeout(() => {
    cb().finally(() => resolve());
  }, delay);

  const promise = new Promise<void>((res) => {
    resolve = () => res();
  }).finally(() => {
    clearTimeout(timer);
  });

  const clear = () => {
    clearTimeout(timer);
    resolve();
  };

  return { promise, clear };
}

export interface UsageTrackerOptions {
  sdkKey: string;
  host: string;
}

export interface TrackReadOptions {
  /** Whether the config was read from in-memory cache or embedded bundle */
  configOrigin: 'in-memory' | 'embedded';
  /** HIT when definitions exist in memory, MISS when not. Omitted for embedded reads. */
  cacheStatus?: 'HIT' | 'MISS';
  /** True for the very first getData call */
  cacheIsFirstRead?: boolean;
  /** Whether the cache read was blocking */
  cacheIsBlocking?: boolean;
  /** Duration in milliseconds from start of getData until trackRead */
  duration?: number;
  /** Timestamp when the config was last updated */
  configUpdatedAt?: number;
}

/**
 * Tracks usage events and batches them for submission to the ingest endpoint.
 */
export class UsageTracker {
  private isFlushing: boolean = false;
  private sdkKey: string;
  private host: string;
  private config: {
    batchSize: number;
    batchDelayMs: number;
  };
  private batcher: {
    flushEvents: () => Promise<void>;
    scheduleEvent: (event: string) => void;
  } | null = null;

  constructor(options: UsageTrackerOptions) {
    this.sdkKey = options.sdkKey;
    this.host = options.host;

    this.config = {
      batchSize: MAX_EVENTS_PER_BATCH,
      batchDelayMs: MAX_BATCH_WAIT_MS,
    };
  }

  /**
   * Triggers an immediate flush of any pending events.
   * Returns a promise that resolves when the flush completes.
   */
  async flush(): Promise<void> {
    if (this.isFlushing) {
      return;
    }

    this.isFlushing = true;

    try {
      await this.batcher?.flushEvents();
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Returns an existing batcher if one exists,
   * creates a new one otherwise.
   */
  getBatcher() {
    if (this.isFlushing) {
      throw new Error(
        '@vercel/flags-core: Cannot write new events after flushing',
      );
    }

    if (this.batcher) return this.batcher;

    let events: string[] = [];
    let timer: null | ReturnType<typeof createAsyncTimeout> = null;
    const inFlight = new Set();

    const internalFlush = async (reason: 'timer' | 'length' | 'force') => {
      const list = events;
      events = [];

      if (list.length === 0) {
        return;
      }

      if (timer) {
        timer.clear();
        timer = null;
      }

      debugLog(
        `@vercel/flags-core: Flushing ${list.length} events due to ${reason}`,
      );

      const promise = (async () => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/x-ndjson',
          Authorization: `Bearer ${this.sdkKey}`,
          'User-Agent': `VercelFlagsCore/${version}`,
        };

        if (isDebugMode) {
          headers['x-vercel-debug-ingest'] = '1';
        }

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            const response = await fetch(`${this.host}/v1/ingest`, {
              method: 'POST',
              headers,
              body: list.join('\n'),
            });

            debugLog(
              '@vercel/flags-core: Event ingest response status:',
              response.status,
              response.headers.get('x-vercel-id'),
            );

            if (response.ok) {
              return; // Success, exit early
            }

            // Only retry on 5xx errors
            if (response.status < 500 || attempt === MAX_RETRIES) {
              console.error(
                '@vercel/flags-core: Failed to flush events with status:',
                response.status,
              );
              return;
            }

            // Wait before retrying
            await sleep(RETRY_DELAY_MS);
          } catch (error) {
            if (attempt === MAX_RETRIES) {
              console.error(
                '@vercel/flags-core: Failed to flush events:',
                error,
              );
              return;
            }

            // Wait before retrying
            await sleep(RETRY_DELAY_MS);
          }
        }
      })();

      inFlight.add(promise);
      promise.finally(() => inFlight.delete(promise));

      await promise;
    };

    const scheduleEvent = (event: string) => {
      events.push(event);

      if (!timer) {
        timer = createAsyncTimeout(
          () => internalFlush('timer'),
          this.config.batchDelayMs,
        );
        waitUntil(timer.promise);
      }

      if (events.length >= this.config.batchSize) {
        waitUntil(internalFlush('length'));
      }
    };

    const flushEvents = async () => {
      try {
        await internalFlush('force'); // Flush the latest events
        await Promise.all(Array.from(inFlight)); // Wait for all in-flight flushes to complete
      } catch (error) {
        console.error('@vercel/flags-core: Failed to flush events:', error);
      }
    };

    this.batcher = {
      flushEvents,
      scheduleEvent,
    };

    if (!this.batcher) throw new Error('Unexpected');
    return this.batcher;
  }

  /**
   * Tracks a config read event. Deduplicates by request context.
   */
  trackRead(options?: TrackReadOptions): void {
    try {
      const { ctx, headers } = getRequestContext();

      // Skip if we've already tracked this request
      if (ctx) {
        if (trackedRequests.has(ctx)) return;
        trackedRequests.add(ctx);
      }

      const event: FlagsConfigReadEvent = {
        type: 'FLAGS_CONFIG_READ',
        ts: Date.now(),
        payload: {
          deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
          region: process.env.VERCEL_REGION,
        },
      };

      if (headers) {
        event.payload.vercelRequestId = headers['x-vercel-id'] ?? undefined;
        event.payload.invocationHost = headers.host ?? undefined;
      }

      if (options) {
        event.payload.configOrigin = options.configOrigin;
        if (options.cacheStatus !== undefined) {
          event.payload.cacheStatus = options.cacheStatus;
        }
        if (options.cacheIsFirstRead !== undefined) {
          event.payload.cacheIsFirstRead = options.cacheIsFirstRead;
        }
        if (options.cacheIsBlocking !== undefined) {
          event.payload.cacheIsBlocking = options.cacheIsBlocking;
        }
        if (options.duration !== undefined) {
          event.payload.duration = options.duration;
        }
        if (options.configUpdatedAt !== undefined) {
          event.payload.configUpdatedAt = options.configUpdatedAt;
        }
      }

      this.getBatcher().scheduleEvent(JSON.stringify(event));
    } catch (error) {
      // trackRead should never throw, but log the error
      console.error('@vercel/flags-core: Failed to record event:', error);
    }
  }
}
