import { waitUntil } from '@vercel/functions';
import { version } from '../../package.json';

const debugLog = (...args: any[]) => {
  if (process.env.DEBUG !== '1') return;
  console.log(...args);
};

export interface FlagsConfigReadEvent {
  type: 'FLAGS_CONFIG_READ';
  ts: number;
  payload: {
    deploymentId?: string;
    region?: string;
    invocationHost?: string;
    invocationPath?: string;
    vercelRequestId?: string;
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

// WeakSet to track request contexts that have already been recorded
// Using WeakSet allows the context objects to be garbage collected
const trackedRequests = new WeakSet<object>();

interface RequestContext {
  ctx: object | undefined;
  headers: Record<string, string> | undefined;
}

/**
 * Gets the Vercel request context and headers from the global symbol.
 */
function getRequestContext(): RequestContext {
  try {
    const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
    const fromSymbol = globalThis as typeof globalThis & {
      [key: symbol]:
        | { get?: () => { headers?: Record<string, string> } }
        | undefined;
    };
    const ctx = fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.();
    if (ctx && 'headers' in ctx) {
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
}

/**
 * Tracks usage events and batches them for submission to the ingest endpoint.
 */
export class UsageTracker {
  private sdkKey: string;
  private host: string;
  private batcher: EventBatcher = {
    events: [],
    resolveWait: null,
    pending: null,
  };

  constructor(options: UsageTrackerOptions) {
    this.sdkKey = options.sdkKey;
    this.host = options.host;
  }

  /**
   * Triggers an immediate flush of any pending events.
   * Returns a promise that resolves when the flush completes.
   */
  flush(): Promise<void> {
    this.batcher.resolveWait?.();
    return this.batcher.pending ?? Promise.resolve();
  }

  /**
   * Tracks a config read event. Deduplicates by request context.
   */
  trackRead(): void {
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
        event.payload.invocationPath = headers['x-invoke-path'] ?? undefined;
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
      waitUntil(pending);

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
      const response = await fetch(`${this.host}/v1/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.sdkKey}`,
          'User-Agent': `VercelFlagsCore/${version}`,
        },
        body: JSON.stringify(eventsToSend),
      });

      if (!response.ok) {
        debugLog('Failed to send events:', response.statusText);
      }
    } catch (error) {
      debugLog('Error sending events:', error);
    }
  }
}
