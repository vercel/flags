import { waitUntil } from '@vercel/functions';
import { version } from '../../package.json';
import { getJitteredWaitMs, getRetryDelayMs } from './backoff';

const RESOLVED_VOID: Promise<void> = Promise.resolve();

const isDebugMode = process.env.DEBUG?.includes('@vercel/flags-core');

const debugLog = (...args: any[]) => {
  if (!isDebugMode) return;
  console.log(...args);
};

export interface FlagsConfigReadEvent {
  type: 'FLAGS_CONFIG_READ';
  ts: number;
  payload: {
    deploymentId?: string;
    region?: string;
    invocationHost?: string;
    vercelRequestId?: string;
    cacheStatus?: 'HIT' | 'MISS' | 'BYPASS' | 'STALE';
    cacheAction?: 'REFRESHING' | 'FOLLOWING' | 'NONE';
    cacheIsBlocking?: boolean;
    cacheIsFirstRead?: boolean;
    duration?: number;
    configUpdatedAt?: number;
    configOrigin?: 'in-memory' | 'embedded' | 'poll' | 'stream' | 'constructor';
    mode?: 'poll' | 'stream' | 'build' | 'offline';
    revision?: string;
    environment?: string;
  };
}

interface EventBatcher {
  events: FlagsConfigReadEvent[];
  /** Resolves the current wait period early (e.g., when batch size is reached) */
  resolveWait: (() => void) | null;
  /** Promise for flush operation */
  pending: null | Promise<void>;
}

const MAX_RETRIES = 3;
const MAX_BATCH_SIZE = 50;
const MAX_BATCH_WAIT_MS = 5000;

/**
 * Symmetric jitter applied to MAX_BATCH_WAIT_MS so that independent processes
 * that started at the same wall-clock time do not flush in lockstep.
 */
const BATCH_WAIT_JITTER_RATIO = 0.2;

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

export interface UsageTrackerOptions {
  sdkKey: string;
  host: string;
  fetch: typeof fetch;
}

export interface TrackReadOptions {
  /** Whether the config was read from in-memory cache or embedded bundle */
  configOrigin: 'in-memory' | 'embedded';
  /** HIT when definitions exist in memory, MISS when not, BYPASS when using fallback as primary source */
  cacheStatus?: 'HIT' | 'MISS' | 'BYPASS';
  /** FOLLOWING when streaming, REFRESHING when polling, NONE otherwise */
  cacheAction?: 'REFRESHING' | 'FOLLOWING' | 'NONE';
  /** True for the very first getData call */
  cacheIsFirstRead?: boolean;
  /** Whether the cache read was blocking */
  cacheIsBlocking?: boolean;
  /** Duration in milliseconds from start of getData until trackRead */
  duration?: number;
  /** Timestamp when the config was last updated */
  configUpdatedAt?: number;
  /** The mode the SDK is operating in */
  mode?: 'poll' | 'stream' | 'build' | 'offline';
  /** Revision of the config */
  revision?: number;
}

/**
 * Tracks usage events and batches them for submission to the ingest endpoint.
 */
export class UsageTracker {
  private flushCounter: number = 0;
  private options: UsageTrackerOptions;
  private trackedRequests = new WeakSet<object>();
  private batcher: EventBatcher = {
    events: [],
    resolveWait: null,
    pending: null,
  };

  constructor(options: UsageTrackerOptions) {
    this.options = options;
  }

  /**
   * Triggers an immediate flush of any pending events.
   * Returns a promise that resolves when the flush completes.
   */
  flush(): Promise<void> {
    if (this.batcher.pending) {
      this.batcher.resolveWait?.();
      return this.batcher.pending;
    }

    // No scheduled flush yet — flush directly if there are queued events
    if (this.batcher.events.length > 0) {
      return this.flushEvents();
    }

    return RESOLVED_VOID;
  }

  /**
   * Tracks a config read event. Deduplicates by request context.
   */
  trackRead(options?: TrackReadOptions): void {
    try {
      const { ctx, headers } = getRequestContext();

      // Skip if request context can't be inferred
      if (!ctx) return;

      // Skip if we've already tracked this request
      if (this.trackedRequests.has(ctx)) return;
      this.trackedRequests.add(ctx);

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
        if (options.cacheAction !== undefined) {
          event.payload.cacheAction = options.cacheAction;
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
        if (options.mode !== undefined) {
          event.payload.mode = options.mode;
        }
        if (options.revision !== undefined) {
          event.payload.revision = String(options.revision);
        }
      }

      const environment =
        process.env.VERCEL_ENV || process.env.NODE_ENV || undefined;
      if (environment) {
        event.payload.environment = environment;
      }

      this.batcher.events.push(event);
      this.scheduleFlush();
    } catch (error) {
      // trackRead should never throw, but log the error
      console.error('@vercel/flags-core: Failed to record event:', error);
    }
  }

  private scheduleFlush(): void {
    if (!this.batcher.pending) {
      let timeout: null | ReturnType<typeof setTimeout> = null;

      const pending = (async () => {
        await new Promise<void>((res) => {
          this.batcher.resolveWait = res;
          timeout = setTimeout(
            res,
            getJitteredWaitMs(MAX_BATCH_WAIT_MS, BATCH_WAIT_JITTER_RATIO),
          );
        });

        this.batcher.pending = null;
        this.batcher.resolveWait = null;
        if (timeout) clearTimeout(timeout);

        await this.flushEvents();
      })();

      // Use waitUntil to keep the function alive until flush completes
      // If `waitUntil` is not available this will be a no-op and leave
      // a floating promise that will be completed in the background
      try {
        waitUntil(pending);
      } catch {
        // waitUntil is best-effort; falling through leaves a floating promise
      }

      this.batcher.pending = pending;
    }

    // Trigger early flush if threshold was reached
    if (this.batcher.events.length >= MAX_BATCH_SIZE) {
      this.batcher.resolveWait?.();
    }
  }

  private async flushEvents(): Promise<void> {
    if (this.batcher.events.length === 0) return;

    // Take all events and clear the queue
    const eventsToSend = this.batcher.events;
    this.batcher.events = [];

    const flushId = ++this.flushCounter;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.options.fetch(
          `${this.options.host}/v1/ingest`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.options.sdkKey}`,
              'User-Agent': `VercelFlagsCore/${version}`,
              ...(process.env.VERCEL_ENV
                ? { 'X-Vercel-Env': process.env.VERCEL_ENV }
                : null),
              ...(isDebugMode ? { 'x-vercel-debug-ingest': '1' } : null),
            },
            body: JSON.stringify(eventsToSend),
          },
        );

        debugLog(
          `@vercel/flags-core: Ingest response ${response.status} for ${eventsToSend.length} events on ${response.headers.get('x-vercel-id')}`,
        );

        if (response.ok) {
          break; // Break the loop if the request succeeded
        }

        throw new Error(
          `Ingest endpoint responded with status ${response.status} for ${eventsToSend.length} events on request ${response.headers.get('x-vercel-id')}.\n` +
            `Response body: ${await response.text().catch(() => null)}`,
        );
      } catch (error) {
        console.error(
          `@vercel/flags-core: Error sending events (attempt=${attempt}/${MAX_RETRIES} flushId=${flushId}):`,
          error,
        );
        if (attempt < MAX_RETRIES) {
          const delayMs = getRetryDelayMs(attempt);
          await new Promise((res) => setTimeout(res, delayMs));
        } else {
          // All retries exhausted — surface a structured warning so consumers
          // can alert on dropped batches. The events are not persisted anywhere.
          console.error(
            `@vercel/flags-core: Dropped ${eventsToSend.length} events after ${MAX_RETRIES} attempts (flushId=${flushId})`,
          );
        }
      }
    }
  }
}
