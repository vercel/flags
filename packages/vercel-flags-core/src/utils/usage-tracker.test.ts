import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { type FlagsConfigReadEvent, UsageTracker } from './usage-tracker';

// Mock @vercel/functions
vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn(),
}));

/**
 * Parse NDJSON (newline-delimited JSON) into an array of objects
 */
function parseNdjson<T>(text: string): T[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T);
}

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  // Clean up environment variables
  delete process.env.VERCEL_DEPLOYMENT_ID;
  delete process.env.VERCEL_REGION;
  delete process.env.DEBUG;
});
afterAll(() => server.close());

describe('UsageTracker', () => {
  describe('constructor', () => {
    it('should create an instance with sdkKey and host', () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      expect(tracker).toBeInstanceOf(UsageTracker);
    });
  });

  describe('trackRead', () => {
    it('should batch events and send them after flush', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      expect(events).toHaveLength(1);
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.type).toBe('FLAGS_CONFIG_READ');
      expect(event.ts).toBeTypeOf('number');
    });

    it('should include deployment ID and region from environment', async () => {
      process.env.VERCEL_DEPLOYMENT_ID = 'dpl_123';
      process.env.VERCEL_REGION = 'iad1';

      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.deploymentId).toBe('dpl_123');
      expect(event.payload.region).toBe('iad1');
    });

    it('should batch multiple events', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      // Track multiple reads (without request context, so they won't be deduplicated)
      tracker.trackRead();
      tracker.trackRead();
      tracker.trackRead();
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as Array<{ type: string }>;
      expect(events).toHaveLength(3);
    });

    it('should send correct authorization header', async () => {
      let authHeader: string | null = null;

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          authHeader = request.headers.get('Authorization');
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'my-secret-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();

      expect(authHeader).toBe('Bearer my-secret-key');
    });

    it('should send correct content-type header', async () => {
      let contentType: string | null = null;

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          contentType = request.headers.get('Content-Type');
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();

      expect(contentType).toBe('application/x-ndjson');
    });

    it('should send user-agent header', async () => {
      let userAgent: string | null = null;

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          userAgent = request.headers.get('User-Agent');
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();

      expect(userAgent).toMatch(/^VercelFlagsCore\//);
    });

    it('should not send empty batches', async () => {
      let requestCount = 0;

      server.use(
        http.post('https://example.com/v1/ingest', async () => {
          requestCount++;
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      // Flush without tracking anything
      await tracker.flush();

      expect(requestCount).toBe(0);
    });

    it('should handle fetch errors gracefully', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      server.use(
        http.post('https://example.com/v1/ingest', () => {
          return HttpResponse.error();
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();

      // Should not throw, but logs error to console.error
      expect(consoleSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Failed to flush events:',
        expect.any(Error),
      );
    });

    it('should handle non-ok responses gracefully', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      server.use(
        http.post('https://example.com/v1/ingest', () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();

      // Should log error to console.error after retries exhausted
      expect(consoleSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Failed to flush events with status:',
        500,
      );
    });

    it('should retry on 5xx errors and succeed on retry', async () => {
      let requestCount = 0;
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          requestCount++;
          if (requestCount < 3) {
            return new HttpResponse(null, { status: 500 });
          }
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();

      // Should have retried and succeeded on 3rd attempt
      expect(requestCount).toBe(3);
      expect(receivedEvents.length).toBe(1);
    });

    it('should retry on 5xx errors up to 2 times then fail', async () => {
      let requestCount = 0;
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      server.use(
        http.post('https://example.com/v1/ingest', () => {
          requestCount++;
          return new HttpResponse(null, { status: 503 });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();

      // Should have made 3 attempts (1 initial + 2 retries)
      expect(requestCount).toBe(3);
      expect(consoleSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Failed to flush events with status:',
        503,
      );
    });

    it('should not retry on 4xx errors', async () => {
      let requestCount = 0;
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      server.use(
        http.post('https://example.com/v1/ingest', () => {
          requestCount++;
          return new HttpResponse(null, { status: 400 });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();

      // Should not retry on 4xx
      expect(requestCount).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Failed to flush events with status:',
        400,
      );
    });

    it('should retry on network errors and succeed on retry', async () => {
      let requestCount = 0;
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          requestCount++;
          if (requestCount < 2) {
            return HttpResponse.error();
          }
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();

      // Should have retried and succeeded on 2nd attempt
      expect(requestCount).toBe(2);
      expect(receivedEvents.length).toBe(1);
    });
  });

  describe('flush', () => {
    it('should trigger immediate flush of pending events', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();

      // Flush immediately instead of waiting for timeout
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);
    });

    it('should be safe to call flush multiple times', async () => {
      let requestCount = 0;

      server.use(
        http.post('https://example.com/v1/ingest', async () => {
          requestCount++;
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();
      await tracker.flush();
      await tracker.flush();

      expect(requestCount).toBe(1);
    });
  });

  describe('request context deduplication', () => {
    it('should deduplicate events with the same request context', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      // Set up a mock request context
      const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
      const mockContext = {
        headers: {
          'x-vercel-id': 'test-request-id',
          host: 'example.com',
        },
      };

      (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => mockContext,
      };

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      // Track multiple times with same context
      tracker.trackRead();
      tracker.trackRead();
      tracker.trackRead();
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      // Only one event should be recorded due to deduplication
      const events = receivedEvents[0] as Array<{ type: string }>;
      expect(events).toHaveLength(1);

      // Clean up
      delete (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];
    });

    it('should include headers from request context', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      // Set up a mock request context
      const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
      const mockContext = {
        headers: {
          'x-vercel-id': 'req_123',
          host: 'myapp.vercel.app',
        },
      };

      (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT] = {
        get: () => mockContext,
      };

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.vercelRequestId).toBe('req_123');
      expect(event.payload.invocationHost).toBe('myapp.vercel.app');

      // Clean up
      delete (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];
    });
  });

  describe('batch size limit', () => {
    it('should trigger flush when batch size reaches 2000', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      // Track 2000 events (without request context to avoid deduplication)
      for (let i = 0; i < 2000; i++) {
        tracker.trackRead();
      }

      // Ensure the auto-flush completes
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as Array<{ type: string }>;
      expect(events).toHaveLength(2000);
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

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      // Should not throw
      expect(() => tracker.trackRead()).not.toThrow();

      // Clean up
      delete (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];
    });
  });

  describe('trackRead options', () => {
    it('should include configOrigin in the event payload', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead({ configOrigin: 'in-memory' });
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.configOrigin).toBe('in-memory');
    });

    it('should include cacheStatus in the event payload', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead({ configOrigin: 'in-memory', cacheStatus: 'HIT' });
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.cacheStatus).toBe('HIT');
    });

    it('should include cacheIsFirstRead in the event payload', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead({ configOrigin: 'in-memory', cacheIsFirstRead: true });
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.cacheIsFirstRead).toBe(true);
    });

    it('should include cacheIsBlocking in the event payload', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead({ configOrigin: 'in-memory', cacheIsBlocking: true });
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.cacheIsBlocking).toBe(true);
    });

    it('should include duration in the event payload', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead({ configOrigin: 'in-memory', duration: 150 });
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.duration).toBe(150);
    });

    it('should include configUpdatedAt in the event payload', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      const timestamp = Date.now();
      tracker.trackRead({
        configOrigin: 'in-memory',
        configUpdatedAt: timestamp,
      });
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.configUpdatedAt).toBe(timestamp);
    });

    it('should include all options in the event payload', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

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

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.configOrigin).toBe('in-memory');
      expect(event.payload.cacheStatus).toBe('MISS');
      expect(event.payload.cacheIsFirstRead).toBe(true);
      expect(event.payload.cacheIsBlocking).toBe(true);
      expect(event.payload.duration).toBe(200);
      expect(event.payload.configUpdatedAt).toBe(timestamp);
    });

    it('should omit undefined options from the event payload', async () => {
      const receivedEvents: FlagsConfigReadEvent[][] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.text();
          receivedEvents.push(parseNdjson<FlagsConfigReadEvent>(body));
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      // Only pass configOrigin, omit others
      tracker.trackRead({ configOrigin: 'embedded' });
      await tracker.flush();

      expect(receivedEvents.length).toBe(1);

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
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
