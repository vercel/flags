import { afterEach, describe, expect, it, vi } from 'vitest';
import { setRequestContext } from '../test-utils';
import { type FlagsConfigReadEvent, UsageTracker } from './usage-tracker';

// Mock @vercel/functions
vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn(),
}));

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    }),
  );
}

afterEach(() => {
  fetchMock.mockReset();
  vi.restoreAllMocks();
  // Clean up environment variables
  delete process.env.VERCEL_DEPLOYMENT_ID;
  delete process.env.VERCEL_REGION;
  delete process.env.DEBUG;
});

function createTracker(sdkKey = 'test-key') {
  return new UsageTracker({
    sdkKey,
    host: 'https://example.com',
    fetch: fetchMock,
  });
}

function getBody(callIndex = 0): unknown {
  const [, init] = fetchMock.mock.calls[callIndex]!;
  return JSON.parse(init!.body as string);
}

function getHeaders(callIndex = 0): Record<string, string> {
  const [, init] = fetchMock.mock.calls[callIndex]!;
  return init!.headers as Record<string, string>;
}

describe('UsageTracker', () => {
  describe('constructor', () => {
    it('should create an instance with sdkKey and host', () => {
      const tracker = createTracker();
      expect(tracker).toBeInstanceOf(UsageTracker);
    });
  });

  describe('trackRead', () => {
    it('should batch events and send them after flush', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const events = getBody() as FlagsConfigReadEvent[];
      expect(events).toHaveLength(1);
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.type).toBe('FLAGS_CONFIG_READ');
      expect(event.ts).toBeTypeOf('number');
    });

    it('should include deployment ID and region from environment', async () => {
      process.env.VERCEL_DEPLOYMENT_ID = 'dpl_123';
      process.env.VERCEL_REGION = 'iad1';

      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.flush();

      const events = getBody() as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.deploymentId).toBe('dpl_123');
      expect(event.payload.region).toBe('iad1');
    });

    it('should batch multiple events', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      // Track multiple reads (without request context, so they won't be deduplicated)
      tracker.trackRead();
      tracker.trackRead();
      tracker.trackRead();
      await tracker.flush();

      const events = getBody() as Array<{ type: string }>;
      expect(events).toHaveLength(3);
    });

    it('should send correct authorization header', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = new UsageTracker({
        sdkKey: 'my-secret-key',
        host: 'https://example.com',
        fetch: fetchMock,
      });

      tracker.trackRead();
      await tracker.flush();

      expect(getHeaders().Authorization).toBe('Bearer my-secret-key');
    });

    it('should send correct content-type header', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.flush();

      expect(getHeaders()['Content-Type']).toBe('application/json');
    });

    it('should send user-agent header', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.flush();

      expect(getHeaders()['User-Agent']).toMatch(/^VercelFlagsCore\//);
    });

    it('should not send empty batches', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      // Flush without tracking anything
      await tracker.flush();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.flush();

      // Should not throw and should not log error (only logs in debug mode)
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should handle non-ok responses gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.flush();

      // Should not log in non-debug mode
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log errors in debug mode', async () => {
      process.env.DEBUG = '@vercel/flags-core';
      vi.resetModules();
      const { UsageTracker: FreshUsageTracker } = await import(
        './usage-tracker'
      );
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

      const tracker = new FreshUsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
        fetch: fetchMock,
      });

      tracker.trackRead();
      await tracker.flush();

      expect(consoleSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Failed to send events:',
        expect.any(String),
      );
    });

    it('should send x-vercel-debug-ingest header in debug mode', async () => {
      process.env.DEBUG = '@vercel/flags-core';
      vi.resetModules();
      const { UsageTracker: FreshUsageTracker } = await import(
        './usage-tracker'
      );
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      fetchMock.mockImplementation(() =>
        jsonResponse(
          { ok: true },
          { headers: { 'x-vercel-id': 'iad1::abcdef-1234' } },
        ),
      );

      const tracker = new FreshUsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
        fetch: fetchMock,
      });

      tracker.trackRead();
      await tracker.flush();

      expect(getHeaders()['x-vercel-debug-ingest']).toBe('1');
      expect(consoleSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Ingest response 200 for 1 events on iad1::abcdef-1234',
      );

      consoleSpy.mockRestore();
    });

    it('should not send x-vercel-debug-ingest header when not in debug mode', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.flush();

      expect(getHeaders()['x-vercel-debug-ingest']).toBeUndefined();
    });

    it('should log ingest response in debug mode', async () => {
      process.env.DEBUG = '@vercel/flags-core';
      vi.resetModules();
      const { UsageTracker: FreshUsageTracker } = await import(
        './usage-tracker'
      );
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = new FreshUsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
        fetch: fetchMock,
      });

      tracker.trackRead();
      await tracker.flush();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '@vercel/flags-core: Ingest response 200 for 1 events',
        ),
      );
    });
  });

  describe('flush', () => {
    it('should trigger immediate flush of pending events', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();

      // Flush immediately instead of waiting for timeout
      await tracker.flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should be safe to call flush multiple times', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead();
      tracker.flush();
      tracker.flush();
      await tracker.flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('request context deduplication', () => {
    it('should deduplicate events with the same request context', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const cleanupContext = setRequestContext({
        'x-vercel-id': 'test-request-id',
        host: 'example.com',
      });

      const tracker = createTracker();

      // Track multiple times with same context
      tracker.trackRead();
      tracker.trackRead();
      tracker.trackRead();
      await tracker.flush();

      // Only one event should be recorded due to deduplication
      const events = getBody() as Array<{ type: string }>;
      expect(events).toHaveLength(1);

      cleanupContext();
    });

    it('should include headers from request context', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const cleanupContext = setRequestContext({
        'x-vercel-id': 'req_123',
        host: 'myapp.vercel.app',
      });

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.flush();

      const events = getBody() as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.vercelRequestId).toBe('req_123');
      expect(event.payload.invocationHost).toBe('myapp.vercel.app');

      cleanupContext();
    });
  });

  describe('cross-instance deduplication', () => {
    it('should not deduplicate across separate UsageTracker instances', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const cleanupContext = setRequestContext({
        'x-vercel-id': 'shared-request-id',
        host: 'example.com',
      });

      const tracker1 = new UsageTracker({
        sdkKey: 'key-1',
        host: 'https://example.com',
        fetch: fetchMock,
      });

      const tracker2 = new UsageTracker({
        sdkKey: 'key-2',
        host: 'https://example.com',
        fetch: fetchMock,
      });

      // Both trackers track with the same request context
      tracker1.trackRead();
      tracker2.trackRead();
      await tracker1.flush();
      await tracker2.flush();

      // Each tracker should have sent its own event
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(getBody(0)).toHaveLength(1);
      expect(getBody(1)).toHaveLength(1);

      cleanupContext();
    });
  });

  describe('flush failure retry', () => {
    it('should re-queue events on failed flush and send them on next flush', async () => {
      let requestCount = 0;

      fetchMock.mockImplementation(async (_input, init) => {
        requestCount++;
        if (requestCount === 1) {
          return new Response(null, { status: 500 });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.flush();

      expect(requestCount).toBe(1);

      // Events should have been re-queued — a new trackRead triggers
      // a new schedule cycle which will include the re-queued events
      tracker.trackRead();
      await tracker.flush();

      expect(requestCount).toBe(2);
      // Should contain both the re-queued event and the new one
      expect(getBody(1)).toHaveLength(2);
    });

    it('should re-queue events on fetch error and send them on next flush', async () => {
      let requestCount = 0;

      fetchMock.mockImplementation(async () => {
        requestCount++;
        if (requestCount === 1) {
          throw new TypeError('Failed to fetch');
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const tracker = createTracker();

      tracker.trackRead();
      await tracker.flush();

      expect(requestCount).toBe(1);

      // Events should have been re-queued — a new trackRead triggers
      // a new schedule cycle which will include the re-queued events
      tracker.trackRead();
      await tracker.flush();

      expect(requestCount).toBe(2);
      // Should contain both the re-queued event and the new one
      expect(getBody(1)).toHaveLength(2);

      consoleSpy.mockRestore();
    });
  });

  describe('batch size limit', () => {
    it('should trigger flush when batch size reaches 50', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      // Track 50 events (without request context to avoid deduplication)
      for (let i = 0; i < 50; i++) {
        tracker.trackRead();
      }

      // Should auto-flush at 50 events — wait for the scheduled flush
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const events = getBody() as Array<{ type: string }>;
      expect(events).toHaveLength(50);
    });
  });

  describe('error handling in trackRead', () => {
    it('should catch and log errors without throwing', async () => {
      // Set up a broken request context that throws
      const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
      (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => {
          throw new Error('Context error');
        },
      };

      const tracker = createTracker();

      // Should not throw
      expect(() => tracker.trackRead()).not.toThrow();

      // Clean up
      delete (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];
    });
  });

  describe('trackRead options', () => {
    it('should include configOrigin in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead({ configOrigin: 'in-memory' });
      await tracker.flush();

      const events = getBody() as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.configOrigin).toBe('in-memory');
    });

    it('should include cacheStatus in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead({ configOrigin: 'in-memory', cacheStatus: 'HIT' });
      await tracker.flush();

      const events = getBody() as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.cacheStatus).toBe('HIT');
    });

    it('should include cacheIsFirstRead in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead({ configOrigin: 'in-memory', cacheIsFirstRead: true });
      await tracker.flush();

      const events = getBody() as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.cacheIsFirstRead).toBe(true);
    });

    it('should include cacheIsBlocking in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead({ configOrigin: 'in-memory', cacheIsBlocking: true });
      await tracker.flush();

      const events = getBody() as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.cacheIsBlocking).toBe(true);
    });

    it('should include duration in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      tracker.trackRead({ configOrigin: 'in-memory', duration: 150 });
      await tracker.flush();

      const events = getBody() as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.duration).toBe(150);
    });

    it('should include configUpdatedAt in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      const timestamp = Date.now();
      tracker.trackRead({
        configOrigin: 'in-memory',
        configUpdatedAt: timestamp,
      });
      await tracker.flush();

      const events = getBody() as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.configUpdatedAt).toBe(timestamp);
    });

    it('should include all options in the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      const timestamp = Date.now();
      tracker.trackRead({
        configOrigin: 'in-memory',
        cacheStatus: 'MISS',
        cacheIsFirstRead: true,
        cacheIsBlocking: true,
        duration: 200,
        configUpdatedAt: timestamp,
      });
      await tracker.flush();

      const events = getBody() as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.configOrigin).toBe('in-memory');
      expect(event.payload.cacheStatus).toBe('MISS');
      expect(event.payload.cacheIsFirstRead).toBe(true);
      expect(event.payload.cacheIsBlocking).toBe(true);
      expect(event.payload.duration).toBe(200);
      expect(event.payload.configUpdatedAt).toBe(timestamp);
    });

    it('should omit undefined options from the event payload', async () => {
      fetchMock.mockImplementation(() => jsonResponse({ ok: true }));

      const tracker = createTracker();

      // Only pass configOrigin, omit others
      tracker.trackRead({ configOrigin: 'embedded' });
      await tracker.flush();

      const events = getBody() as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.configOrigin).toBe('embedded');
      expect(event.payload.cacheStatus).toBeUndefined();
      expect(event.payload.cacheIsFirstRead).toBeUndefined();
      expect(event.payload.cacheIsBlocking).toBeUndefined();
      expect(event.payload.duration).toBeUndefined();
      expect(event.payload.configUpdatedAt).toBeUndefined();
    });
  });
});
