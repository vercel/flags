import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
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
import type { BundledDefinitions, BundledDefinitionsResult } from '../types';
import { FlagNetworkDataSource } from './flag-network-data-source';

let ingestRequests: { body: unknown; headers: Headers }[] = [];

const server = setupServer(
  http.post('https://flags.vercel.com/v1/ingest', async ({ request }) => {
    ingestRequests.push({
      body: await request.json(),
      headers: request.headers,
    });
    return HttpResponse.json({ ok: true });
  }),
);

beforeAll(() => server.listen());
beforeEach(() => {
  ingestRequests = [];
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function createNdjsonStream(messages: object[], delayMs = 0): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      for (const message of messages) {
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify(message) + '\n'),
        );
      }
      controller.close();
    },
  });
}

async function assertIngestRequest(
  sdkKey: string,
  expectedEvents: Array<{ type: string; payload?: object }>,
) {
  await vi.waitFor(() => {
    expect(ingestRequests.length).toBeGreaterThan(0);
  });

  const request = ingestRequests[0]!;
  expect(request.headers.get('Authorization')).toBe(`Bearer ${sdkKey}`);
  expect(request.headers.get('Content-Type')).toBe('application/json');
  expect(request.headers.get('User-Agent')).toMatch(/^VercelFlagsCore\//);

  expect(request.body).toEqual(
    expectedEvents.map((event) =>
      expect.objectContaining({
        type: event.type,
        ts: expect.any(Number),
        payload: event.payload ?? expect.any(Object),
      }),
    ),
  );
}

describe('new FlagNetworkDataSource', () => {
  it('should parse datafile messages from NDJSON stream', async () => {
    const definitions = {
      projectId: 'test-project',
      definitions: { 'my-flag': { variants: [true, false] } },
    };

    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          createNdjsonStream([{ type: 'datafile', data: definitions }]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    await dataSource.getData();

    expect(dataSource.definitions).toEqual(definitions);

    await dataSource.shutdown();
    await assertIngestRequest('vf_test_key', [{ type: 'FLAGS_CONFIG_READ' }]);
  });

  it('should ignore ping messages', async () => {
    const definitions = {
      projectId: 'test-project',
      definitions: {},
    };

    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          createNdjsonStream([
            { type: 'ping' },
            { type: 'datafile', data: definitions },
            { type: 'ping' },
          ]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    await dataSource.getData();

    expect(dataSource.definitions).toEqual(definitions);

    await dataSource.shutdown();
    await assertIngestRequest('vf_test_key', [{ type: 'FLAGS_CONFIG_READ' }]);
  });

  it('should stop reconnecting after shutdown is called', async () => {
    const definitions = {
      projectId: 'test-project',
      definitions: {},
    };

    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          createNdjsonStream([{ type: 'datafile', data: definitions }]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    await dataSource.getData();

    await vi.waitFor(() => {
      expect(dataSource.definitions).toEqual(definitions);
    });

    await dataSource.shutdown();

    expect(dataSource.breakLoop).toBe(true);
    await assertIngestRequest('vf_test_key', [{ type: 'FLAGS_CONFIG_READ' }]);
  });

  it('should abort the stream connection when shutdown is called', async () => {
    let abortSignalReceived: AbortSignal | undefined;

    server.use(
      http.get('https://flags.vercel.com/v1/stream', async ({ request }) => {
        // Capture the abort signal from the request
        abortSignalReceived = request.signal;

        const stream = new ReadableStream({
          start(controller) {
            // Send initial data so getData() can return
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({
                  type: 'datafile',
                  data: { projectId: 'test', definitions: {} },
                }) + '\n',
              ),
            );

            // Listen for abort and close the stream
            request.signal.addEventListener('abort', () => {
              controller.close();
            });
          },
        });

        return new HttpResponse(stream, {
          headers: { 'Content-Type': 'application/x-ndjson' },
        });
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    await dataSource.getData();

    // Verify the abort signal was passed to the request and not yet aborted
    expect(abortSignalReceived).toBeDefined();
    expect(abortSignalReceived!.aborted).toBe(false);

    // Shutdown should abort the stream
    await dataSource.shutdown();

    // Verify the abort signal was triggered
    expect(abortSignalReceived!.aborted).toBe(true);
  });

  it('should handle messages split across chunks', async () => {
    const definitions = {
      projectId: 'test-project',
      definitions: { flag: { variants: [1, 2, 3] } },
    };

    const fullMessage = JSON.stringify({ type: 'datafile', data: definitions });
    const part1 = fullMessage.slice(0, 20);
    const part2 = fullMessage.slice(20) + '\n';

    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(new TextEncoder().encode(part1));
              await new Promise((r) => setTimeout(r, 10));
              controller.enqueue(new TextEncoder().encode(part2));
              controller.close();
            },
          }),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    await dataSource.getData();

    expect(dataSource.definitions).toEqual(definitions);

    await dataSource.shutdown();
    await assertIngestRequest('vf_test_key', [{ type: 'FLAGS_CONFIG_READ' }]);
  });

  it('should update definitions when new datafile messages arrive', async () => {
    const definitions1 = { projectId: 'test', definitions: { v: 1 } };
    const definitions2 = { projectId: 'test', definitions: { v: 2 } };

    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          createNdjsonStream([
            { type: 'datafile', data: definitions1 },
            { type: 'datafile', data: definitions2 },
          ]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    await dataSource.getData();

    await vi.waitFor(() => {
      expect(dataSource.definitions).toEqual(definitions2);
    });

    await dataSource.shutdown();
    await assertIngestRequest('vf_test_key', [{ type: 'FLAGS_CONFIG_READ' }]);
  });

  it('should fall back to bundledDefinitions when stream times out', async () => {
    const bundledDefinitions: BundledDefinitions = {
      projectId: 'bundled-project',
      definitions: {},
      environment: 'production',
      updatedAt: 1000,
      digest: 'aa',
      revision: 1,
    };

    // Create a stream that never sends data (simulating timeout)
    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          new ReadableStream({
            start() {
              // Never enqueue anything, never close - simulates hanging connection
            },
          }),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    // Manually set bundledDefinitions for this test
    dataSource.bundledDefinitionsPromise =
      Promise.resolve<BundledDefinitionsResult>({
        definitions: bundledDefinitions,
        state: 'ok',
      });

    // getData should return bundledDefinitions after timeout (3s default)
    const startTime = Date.now();
    const result = await dataSource.getData();
    const elapsed = Date.now() - startTime;

    // Should have returned bundled definitions
    expect(result).toEqual(bundledDefinitions);

    // Should have taken roughly 3 seconds (the timeout)
    expect(elapsed).toBeGreaterThanOrEqual(2900);
    expect(elapsed).toBeLessThan(4000);

    // Don't await shutdown - the stream never closes in this test
    // Just trigger shutdown to stop the loop
    dataSource.shutdown();
  }, 10000);

  it('should fall back to bundledDefinitions when stream errors (4xx)', async () => {
    const bundledDefinitions: BundledDefinitions = {
      projectId: 'bundled-project',
      definitions: {},
      environment: 'production',
      updatedAt: 1000,
      digest: 'aa',
      revision: 1,
    };

    // Return a 401 error - this will cause the stream to fail permanently (4xx stops retrying)
    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    // Manually set bundledDefinitions for this test
    dataSource.bundledDefinitionsPromise =
      Promise.resolve<BundledDefinitionsResult>({
        definitions: bundledDefinitions,
        state: 'ok',
      });

    // Suppress expected error logs for this test
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // getData should return bundledDefinitions on error (after timeout races)
    const result = await dataSource.getData();

    expect(result).toEqual(bundledDefinitions);

    await dataSource.shutdown();

    errorSpy.mockRestore();
  });

  it('should include X-Retry-Attempt header in stream requests', async () => {
    let capturedHeaders: Headers | null = null;

    server.use(
      http.get('https://flags.vercel.com/v1/stream', ({ request }) => {
        capturedHeaders = request.headers;
        return new HttpResponse(
          createNdjsonStream([
            {
              type: 'datafile',
              data: { projectId: 'test', definitions: {} },
            },
          ]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    await dataSource.getData();

    expect(capturedHeaders).not.toBeNull();
    expect(capturedHeaders!.get('X-Retry-Attempt')).toBe('0');

    await dataSource.shutdown();
  });

  it('should warn when returning in-memory data while stream is disconnected', async () => {
    const definitions = {
      projectId: 'test-project',
      definitions: { flag: true },
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // First, successfully connect and get data
    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          createNdjsonStream([{ type: 'datafile', data: definitions }]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    await dataSource.getData();

    // Verify no warning on first successful read (stream is connected)
    expect(warnSpy).not.toHaveBeenCalled();

    // Now simulate stream disconnection by changing handler to error
    // and wait for the stream to close and enter reconnecting state
    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    // Wait a bit for the stream to close and try to reconnect (and fail)
    await vi.waitFor(
      () => {
        // The stream should be in reconnecting state
        expect(errorSpy).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    // Next getData should warn about potentially stale data
    await dataSource.getData();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Returning in-memory flag definitions'),
    );

    // Should only warn once
    warnSpy.mockClear();
    await dataSource.getData();
    expect(warnSpy).not.toHaveBeenCalled();

    await dataSource.shutdown();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  }, 10000);
});
