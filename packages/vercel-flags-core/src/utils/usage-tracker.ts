import { waitUntil } from '@vercel/functions';
import { version } from '../../package.json';

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

const MAX_EVENTS_PER_STREAM = 1000;

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
  private sdkKey: string;
  private host: string;
  private stream: {
    flush: () => Promise<void>;
    writeEvent: (event: FlagsConfigReadEvent) => Promise<void>;
  } | null;

  constructor(options: UsageTrackerOptions) {
    this.sdkKey = options.sdkKey;
    this.host = options.host;
    this.stream = null;

    // On Vercel, at build- and runtime, we add a SIGTERM handler
    // to ensure the connection is closed gracefully.
    // Vercel gives us 500 ms and then kills the process,
    // we can't add this for every case as it would change
    // the default behaviour of SIGTERM for other uses cases.
    if (
      process.env.VERCEL &&
      process.env.VERCEL_DEPLOYMENT_ID &&
      process.env.VERCEL_ENV !== 'development'
    ) {
      process.once('SIGTERM', () => {
        console.log('@vercel/flags-core: Received SIGTERM');
        void this.flush();
      });
    }
  }

  /**
   * Opens a new connection by calling fetch if there's not already an open one.
   */
  getStream() {
    if (this.stream) {
      return this.stream;
    }

    let isFlushing = false;

    const writes = new Map<number, Promise<void>>();
    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    writer.closed
      .then(() => {
        this.stream = null;
      })
      .catch((err) => {
        this.stream = null;
      });

    const fetchPromise = fetch(`${this.host}/v1/ingest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.sdkKey}`,
        'Content-Type': 'application/x-ndjson',
        'User-Agent': `VercelFlagsCore/${version}`,
      },
      // @ts-expect-error: Required when fetch is using undici
      //             and uses a streaming body.
      duplex: 'half',
      body: readable,
    })
      .then(() => {
        this.stream = null;
      })
      .catch((error) => {
        this.stream = null;
        console.error(
          '@vercel/flags-core: Error when streaming events:',
          error,
        );
      });

    const drainWrites = async () => {
      for (const write of writes) {
        try {
          await write[1];
        } catch {
          /* no-op */
        }
      }
    };

    const flush = async () => {
      try {
        if (isFlushing) {
          await drainWrites();
          await fetchPromise;
          return;
        }

        isFlushing = true;

        // Set the stream to null to ensure a new one is opened as
        // soon as possible so this writer won't be used again.
        this.stream = null;

        // Close the stream and wait for the request to complete
        await drainWrites();
        await writer.close();
        await fetchPromise;
      } catch (error) {
        console.error('@vercel/flags-core: Failed to flush events:', error);
      }
    };

    let globalCounter = 0;

    const writeEvent = async (event: FlagsConfigReadEvent) => {
      const counter = ++globalCounter;

      const writePromise = (async () => {
        const line = JSON.stringify(event) + '\n';
        const data = encoder.encode(line);

        await writer.ready;
        await writer.write(data);

        // Give the first event more time for network overhead, as this
        // might run on Lambda where the execution context gets frozen.
        if (counter === 1) {
          await new Promise((res) => setTimeout(res, 100));
        }
      })();

      writes.set(counter, writePromise);

      writePromise.finally(() => {
        writes.delete(counter);
      });

      await writePromise
        .then(async () => {
          // Force flush after max. amount of events
          if (counter >= MAX_EVENTS_PER_STREAM) {
            await flush();
          }
        })
        .catch(async (error) => {
          console.error('@vercel/flags-core: Failed to write event:', error);
          await flush();
        });
    };

    this.stream = {
      writeEvent,
      flush,
    };

    // For typesafety
    if (this.stream) return this.stream;
    throw new Error('Unexpected report stream state');
  }

  /**
   * Triggers an immediate flush of any pending events.
   * Returns a promise that resolves when the flush completes.
   */
  async flush(): Promise<void> {
    return this.stream?.flush();
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

      waitUntil(this.getStream().writeEvent(event));
    } catch (error) {
      // trackRead should never throw, but log the error
      console.error('@vercel/flags-core: Failed to record event:', error);
    }
  }
}
