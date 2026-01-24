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
      const receivedEvents: unknown[] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.json();
          receivedEvents.push(body);
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      tracker.flush();

      await vi.waitFor(() => {
        expect(receivedEvents.length).toBe(1);
      });

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      expect(events).toHaveLength(1);
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.type).toBe('FLAGS_CONFIG_READ');
      expect(event.ts).toBeTypeOf('number');
    });

    it('should include deployment ID and region from environment', async () => {
      process.env.VERCEL_DEPLOYMENT_ID = 'dpl_123';
      process.env.VERCEL_REGION = 'iad1';

      const receivedEvents: unknown[] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.json();
          receivedEvents.push(body);
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();
      tracker.flush();

      await vi.waitFor(() => {
        expect(receivedEvents.length).toBe(1);
      });

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.deploymentId).toBe('dpl_123');
      expect(event.payload.region).toBe('iad1');
    });

    it('should batch multiple events', async () => {
      const receivedEvents: unknown[] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.json();
          receivedEvents.push(body);
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
      tracker.flush();

      await vi.waitFor(() => {
        expect(receivedEvents.length).toBe(1);
      });

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
      tracker.flush();

      await vi.waitFor(() => {
        expect(authHeader).toBe('Bearer my-secret-key');
      });
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
      tracker.flush();

      await vi.waitFor(() => {
        expect(contentType).toBe('application/json');
      });
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
      tracker.flush();

      await vi.waitFor(() => {
        expect(userAgent).toMatch(/^VercelFlagsCore\//);
      });
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
      tracker.flush();

      // Wait a bit to ensure no request is made
      await new Promise((r) => setTimeout(r, 100));
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
      tracker.flush();

      // Wait for the flush to complete
      await new Promise((r) => setTimeout(r, 100));

      // Should not throw and should not log error (only logs in debug mode)
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should handle non-ok responses gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

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
      tracker.flush();

      // Wait for the flush to complete
      await new Promise((r) => setTimeout(r, 100));

      // Should not log in non-debug mode
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log errors in debug mode', async () => {
      process.env.DEBUG = '1';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

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
      tracker.flush();

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to send events:',
          expect.any(String),
        );
      });
    });
  });

  describe('flush', () => {
    it('should trigger immediate flush of pending events', async () => {
      const receivedEvents: unknown[] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.json();
          receivedEvents.push(body);
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      tracker.trackRead();

      // Flush immediately instead of waiting for timeout
      tracker.flush();

      await vi.waitFor(() => {
        expect(receivedEvents.length).toBe(1);
      });
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
      tracker.flush();
      tracker.flush();
      tracker.flush();

      await vi.waitFor(() => {
        expect(requestCount).toBe(1);
      });

      // Wait a bit more to ensure no additional requests
      await new Promise((r) => setTimeout(r, 100));
      expect(requestCount).toBe(1);
    });
  });

  describe('request context deduplication', () => {
    it('should deduplicate events with the same request context', async () => {
      const receivedEvents: unknown[] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.json();
          receivedEvents.push(body);
          return HttpResponse.json({ ok: true });
        }),
      );

      // Set up a mock request context
      const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
      const mockContext = {
        headers: {
          'x-vercel-id': 'test-request-id',
          host: 'example.com',
          'x-invoke-path': '/api/test',
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
      tracker.flush();

      await vi.waitFor(() => {
        expect(receivedEvents.length).toBe(1);
      });

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
          const body = (await request.json()) as FlagsConfigReadEvent[];
          receivedEvents.push(body);
          return HttpResponse.json({ ok: true });
        }),
      );

      // Set up a mock request context
      const SYMBOL_FOR_REQ_CONTEXT = Symbol.for('@vercel/request-context');
      const mockContext = {
        headers: {
          'x-vercel-id': 'req_123',
          host: 'myapp.vercel.app',
          'x-invoke-path': '/api/flags',
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
      tracker.flush();

      await vi.waitFor(() => {
        expect(receivedEvents.length).toBe(1);
      });

      const events = receivedEvents[0] as FlagsConfigReadEvent[];
      const event = events[0] as FlagsConfigReadEvent;
      expect(event.payload.vercelRequestId).toBe('req_123');
      expect(event.payload.invocationHost).toBe('myapp.vercel.app');
      expect(event.payload.invocationPath).toBe('/api/flags');

      // Clean up
      delete (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];
    });
  });

  describe('batch size limit', () => {
    it('should trigger flush when batch size reaches 50', async () => {
      const receivedEvents: unknown[] = [];

      server.use(
        http.post('https://example.com/v1/ingest', async ({ request }) => {
          const body = await request.json();
          receivedEvents.push(body);
          return HttpResponse.json({ ok: true });
        }),
      );

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: 'https://example.com',
      });

      // Track 50 events (without request context to avoid deduplication)
      for (let i = 0; i < 50; i++) {
        tracker.trackRead();
      }

      // Should auto-flush at 50 events
      await vi.waitFor(() => {
        expect(receivedEvents.length).toBe(1);
      });

      const events = receivedEvents[0] as Array<{ type: string }>;
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
});
