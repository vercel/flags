import { createServer, type IncomingMessage, type Server } from 'node:http';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { type FlagsConfigReadEvent, UsageTracker } from './usage-tracker';

// Mock @vercel/functions
vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn((promise: Promise<unknown>) => {
    promise.catch(() => {});
  }),
}));

/**
 * Helper to parse NDJSON from request body
 */
function parseNdjson(body: string): FlagsConfigReadEvent[] {
  if (!body.trim()) return [];
  const lines = body.trim().split('\n').filter(Boolean);
  return lines.map((line) => JSON.parse(line) as FlagsConfigReadEvent);
}

/**
 * Helper to read request body
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// Test server state
let server: Server;
let serverPort: number;
let capturedRequests: Array<{
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  events: FlagsConfigReadEvent[];
}> = [];
let serverResponseStatus = 202;

beforeAll(async () => {
  // Create HTTP server
  server = createServer(async (req, res) => {
    // Suppress connection errors during cleanup
    req.on('error', () => {});
    res.on('error', () => {});

    const body = await readBody(req).catch(() => '');
    const events = parseNdjson(body);

    capturedRequests.push({
      method: req.method || 'GET',
      url: req.url || '/',
      headers: req.headers,
      body,
      events,
    });

    res.statusCode = serverResponseStatus;
    res.setHeader('Content-Type', 'application/json');
    res.end();
  });

  // Suppress server-level connection errors during cleanup
  server.on('clientError', () => {});

  // Start server on random available port
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        serverPort = address.port;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  // Force close all connections by calling closeAllConnections
  // This is needed because streaming connections may still be open
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

beforeEach(() => {
  capturedRequests = [];
  serverResponseStatus = 200;
});

afterEach(() => {
  vi.restoreAllMocks();
  // Clean up environment variables
  delete process.env.VERCEL_DEPLOYMENT_ID;
  delete process.env.VERCEL_REGION;
  delete process.env.DEBUG;
});

describe('UsageTracker', () => {
  describe('constructor', () => {
    it('should create an instance with sdkKey and host', () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      expect(tracker).toBeInstanceOf(UsageTracker);
    });
  });

  describe('trackRead', () => {
    it('should stream events and send them after flush', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead();
      await tracker.flush();

      // Wait for request to be processed
      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      const request = capturedRequests[0]!;
      expect(request.events).toHaveLength(1);
      const event = request.events[0]!;
      expect(event.type).toBe('FLAGS_CONFIG_READ');
      expect(event.ts).toBeTypeOf('number');
    });

    it('should include deployment ID and region from environment', async () => {
      process.env.VERCEL_DEPLOYMENT_ID = 'dpl_123';
      process.env.VERCEL_REGION = 'iad1';

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead();
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      const event = capturedRequests[0]!.events[0]!;
      expect(event.payload.deploymentId).toBe('dpl_123');
      expect(event.payload.region).toBe('iad1');
    });

    it('should stream multiple events', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      // Track multiple reads (without request context, so they won't be deduplicated)
      tracker.trackRead();
      tracker.trackRead();
      tracker.trackRead();
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      const request = capturedRequests[0]!;
      expect(request.events).toHaveLength(3);
      expect(request.events.every((e) => e.type === 'FLAGS_CONFIG_READ')).toBe(
        true,
      );
    });

    it('should send correct authorization header', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'my-secret-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead();
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      expect(capturedRequests[0]!.headers['authorization']).toBe(
        'Bearer my-secret-key',
      );
    });

    it('should send correct content-type header', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead();
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      expect(capturedRequests[0]!.headers['content-type']).toBe(
        'application/x-ndjson',
      );
    });

    it('should send user-agent header', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead();
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      expect(capturedRequests[0]!.headers['user-agent']).toMatch(
        /^VercelFlagsCore\//,
      );
    });

    it('should not open stream when no events are tracked', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      // Flush without tracking anything - should be a no-op since no stream exists
      await tracker.flush();

      // Wait a bit to ensure no request is made
      await new Promise((r) => setTimeout(r, 100));
      expect(capturedRequests.length).toBe(0);
    });

    it('should handle server errors gracefully', async () => {
      serverResponseStatus = 500;

      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead();
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      // The implementation doesn't check response status, so no error is logged
      // Events are still sent successfully
      expect(capturedRequests[0]!.events).toHaveLength(1);
    });
  });

  describe('flush', () => {
    it('should trigger immediate flush of pending events', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead();
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      expect(capturedRequests[0]!.events).toHaveLength(1);
    });

    it('should be safe to call flush multiple times', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead();
      // First flush closes the stream and completes the request
      await tracker.flush();
      // Subsequent flushes are no-ops since stream is null
      await tracker.flush();
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      // Wait a bit more to ensure no additional requests
      await new Promise((r) => setTimeout(r, 100));
      expect(capturedRequests.length).toBe(1);
    });
  });

  describe('request context deduplication', () => {
    it('should deduplicate events with the same request context', async () => {
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
        host: `http://127.0.0.1:${serverPort}`,
      });

      // Track multiple times with same context
      tracker.trackRead();
      tracker.trackRead();
      tracker.trackRead();
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      // Only one event should be recorded due to deduplication
      expect(capturedRequests[0]!.events).toHaveLength(1);

      // Clean up
      delete (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];
    });

    it('should include headers from request context', async () => {
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
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead();
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      const event = capturedRequests[0]!.events[0]!;
      expect(event.payload.vercelRequestId).toBe('req_123');
      expect(event.payload.invocationHost).toBe('myapp.vercel.app');

      // Clean up
      delete (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];
    });
  });

  describe('stream event limit', () => {
    it('should trigger flush when event count reaches MAX_EVENTS_PER_STREAM (1000)', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      // Track 1000 events (without request context to avoid deduplication)
      for (let i = 0; i < 1000; i++) {
        tracker.trackRead();
      }

      // Wait for auto-flush to complete (1000 events + 100ms first event delay)
      await vi.waitFor(
        () => {
          expect(capturedRequests.length).toBeGreaterThanOrEqual(1);
        },
        { timeout: 15000 },
      );

      // Count total events across all requests
      const totalEvents = capturedRequests.reduce(
        (sum, req) => sum + req.events.length,
        0,
      );
      expect(totalEvents).toBe(1000);
    }, 30000);
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
        host: `http://127.0.0.1:${serverPort}`,
      });

      // Should not throw
      expect(() => tracker.trackRead()).not.toThrow();

      // Clean up
      delete (globalThis as any)[SYMBOL_FOR_REQ_CONTEXT];
    });
  });

  describe('trackRead options', () => {
    it('should include configOrigin in the event payload', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead({ configOrigin: 'in-memory' });
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      const event = capturedRequests[0]!.events[0]!;
      expect(event.payload.configOrigin).toBe('in-memory');
    });

    it('should include cacheStatus in the event payload', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead({ configOrigin: 'in-memory', cacheStatus: 'HIT' });
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      const event = capturedRequests[0]!.events[0]!;
      expect(event.payload.cacheStatus).toBe('HIT');
    });

    it('should include cacheIsFirstRead in the event payload', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead({ configOrigin: 'in-memory', cacheIsFirstRead: true });
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      const event = capturedRequests[0]!.events[0]!;
      expect(event.payload.cacheIsFirstRead).toBe(true);
    });

    it('should include cacheIsBlocking in the event payload', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead({ configOrigin: 'in-memory', cacheIsBlocking: true });
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      const event = capturedRequests[0]!.events[0]!;
      expect(event.payload.cacheIsBlocking).toBe(true);
    });

    it('should include duration in the event payload', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      tracker.trackRead({ configOrigin: 'in-memory', duration: 150 });
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      const event = capturedRequests[0]!.events[0]!;
      expect(event.payload.duration).toBe(150);
    });

    it('should include configUpdatedAt in the event payload', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      const timestamp = Date.now();
      tracker.trackRead({
        configOrigin: 'in-memory',
        configUpdatedAt: timestamp,
      });
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      const event = capturedRequests[0]!.events[0]!;
      expect(event.payload.configUpdatedAt).toBe(timestamp);
    });

    it('should include all options in the event payload', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
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

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      const event = capturedRequests[0]!.events[0]!;
      expect(event.payload.configOrigin).toBe('in-memory');
      expect(event.payload.cacheStatus).toBe('MISS');
      expect(event.payload.cacheIsFirstRead).toBe(true);
      expect(event.payload.cacheIsBlocking).toBe(true);
      expect(event.payload.duration).toBe(200);
      expect(event.payload.configUpdatedAt).toBe(timestamp);
    });

    it('should omit undefined options from the event payload', async () => {
      const tracker = new UsageTracker({
        sdkKey: 'test-key',
        host: `http://127.0.0.1:${serverPort}`,
      });

      // Only pass configOrigin, omit others
      tracker.trackRead({ configOrigin: 'embedded' });
      await tracker.flush();

      await vi.waitFor(() => {
        expect(capturedRequests.length).toBe(1);
      });

      const event = capturedRequests[0]!.events[0]!;
      expect(event.payload.configOrigin).toBe('embedded');
      expect(event.payload.cacheStatus).toBeUndefined();
      expect(event.payload.cacheIsFirstRead).toBeUndefined();
      expect(event.payload.cacheIsBlocking).toBeUndefined();
      expect(event.payload.duration).toBeUndefined();
      expect(event.payload.configUpdatedAt).toBeUndefined();
    });
  });
});
