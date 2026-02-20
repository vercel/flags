import { waitUntil } from '@vercel/functions';
import { version } from '../../package.json';

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
    cacheStatus?: 'HIT' | 'MISS' | 'BYPASS';
    cacheAction?: 'REFRESHING' | 'FOLLOWING' | 'NONE';
    cacheIsBlocking?: boolean;
    cacheIsFirstRead?: boolean;
    duration?: number;
    configUpdatedAt?: number;
    configOrigin?: 'in-memory' | 'embedded';
  };
}

interface EventBatcher {
  events: FlagsConfigReadEvent[];
  /** Resolves the current wait period early (e.g., when batch size is reached) */
  resolveWait: (() => void) | null;
  /** Promise for flush operation */
  pending: null | Promise<void>;
}

const MAX_BATCH_SIZE = 50;
const MAX_BATCH_WAIT_MS = 5000;

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
}

/**
 * Tracks usage events and batches them for submission to the ingest endpoint.
 */
export class UsageTracker {
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
    this.batcher.resolveWait?.();
    return this.batcher.pending ?? RESOLVED_VOID;
  }

  /**
   * Tracks a config read event. Deduplicates by request context.
   */
  trackRead(options?: TrackReadOptions): void {
    try {
      const { ctx, headers } = getRequestContext();

      // Skip if we've already tracked this request
      if (ctx) {
        if (this.trackedRequests.has(ctx)) return;
        this.trackedRequests.add(ctx);
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
          timeout = setTimeout(res, MAX_BATCH_WAIT_MS);
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

    try {
      const response = await this.options.fetch(
        `${this.options.host}/v1/ingest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.options.sdkKey}`,
            'User-Agent': `VercelFlagsCore/${version}`,
            ...(isDebugMode ? { 'x-vercel-debug-ingest': '1' } : null),
          },
          body: JSON.stringify(eventsToSend),
        },
      );

      debugLog(
        `@vercel/flags-core: Ingest response ${response.status} for ${eventsToSend.length} events on ${response.headers.get('x-vercel-id')}`,
      );

      if (!response.ok) {
        debugLog(
          '@vercel/flags-core: Failed to send events:',
          response.statusText,
        );
        this.batcher.events.unshift(...eventsToSend);
      }
    } catch (error) {
      debugLog('@vercel/flags-core: Error sending events:', error);
      this.batcher.events.unshift(...eventsToSend);
    }
  }
}
