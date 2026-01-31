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
import type { BundledDefinitions } from '../types';
import { FlagNetworkDataSource } from './flag-network-data-source';

// Mock the bundled definitions module
vi.mock('../utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(() =>
    Promise.resolve({ definitions: null, state: 'missing-file' }),
  ),
}));

import { readBundledDefinitions } from '../utils/read-bundled-definitions';

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

const originalEnv = { ...process.env };

beforeAll(() => server.listen());
beforeEach(() => {
  ingestRequests = [];
  vi.mocked(readBundledDefinitions).mockReset();
  vi.mocked(readBundledDefinitions).mockResolvedValue({
    definitions: null,
    state: 'missing-file',
  });
  // Reset env vars that affect build step detection
  delete process.env.CI;
  delete process.env.NEXT_PHASE;
});
afterEach(() => {
  server.resetHandlers();
  // Restore original env
  process.env = { ...originalEnv };
});
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

describe('FlagNetworkDataSource', () => {
  // Note: Low-level NDJSON parsing tests (parse datafile, ignore ping, handle split chunks)
  // are in stream-connection.test.ts. These tests focus on FlagNetworkDataSource-specific behavior.

  it('should abort the stream connection when shutdown is called', async () => {
    let abortSignalReceived: AbortSignal | undefined;

    server.use(
      http.get('https://flags.vercel.com/v1/stream', async ({ request }) => {
        abortSignalReceived = request.signal;

        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({
                  type: 'datafile',
                  data: { projectId: 'test', definitions: {} },
                }) + '\n',
              ),
            );

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
    await dataSource.read();

    expect(abortSignalReceived).toBeDefined();
    expect(abortSignalReceived!.aborted).toBe(false);

    await dataSource.shutdown();

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
    const result = await dataSource.read();

    expect(result).toMatchObject(definitions);
    expect(result.metrics.source).toBe('in-memory');
    expect(result.metrics.cacheStatus).toBe('MISS');

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

    // First call gets initial data
    await dataSource.read();

    // Wait for stream to process second message, then verify via read
    await vi.waitFor(async () => {
      const result = await dataSource.read();
      expect(result).toMatchObject(definitions2);
    });

    await dataSource.shutdown();
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

    // Mock bundled definitions to return valid data
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      definitions: bundledDefinitions,
      state: 'ok',
    });

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

    // read should return bundledDefinitions after timeout (3s default)
    const startTime = Date.now();
    const result = await dataSource.read();
    const elapsed = Date.now() - startTime;

    // Should have returned bundled definitions with STALE status
    expect(result).toMatchObject(bundledDefinitions);
    expect(result.metrics.source).toBe('embedded');
    expect(result.metrics.cacheStatus).toBe('STALE');

    // Should have taken roughly 3 seconds (the timeout)
    expect(elapsed).toBeGreaterThanOrEqual(2900);
    expect(elapsed).toBeLessThan(4000);

    // Don't await shutdown - the stream never closes in this test
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

    // Mock bundled definitions to return valid data
    vi.mocked(readBundledDefinitions).mockResolvedValue({
      definitions: bundledDefinitions,
      state: 'ok',
    });

    // Return a 401 error - this will cause the stream to fail permanently
    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });

    // Suppress expected error logs for this test
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await dataSource.read();

    expect(result).toMatchObject(bundledDefinitions);
    expect(result.metrics.source).toBe('embedded');
    expect(result.metrics.cacheStatus).toBe('STALE');

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
    await dataSource.read();

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
    await dataSource.read();

    // Verify no warning on first successful read (stream is connected)
    expect(warnSpy).not.toHaveBeenCalled();

    // Now simulate stream disconnection by changing handler to error
    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    // Wait for the stream to close and try to reconnect (and fail)
    await vi.waitFor(
      () => {
        expect(errorSpy).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    // Next read should warn about potentially stale data
    await dataSource.read();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Returning in-memory flag definitions'),
    );

    // Should only warn once
    warnSpy.mockClear();
    await dataSource.read();
    expect(warnSpy).not.toHaveBeenCalled();

    await dataSource.shutdown();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  }, 10000);

  describe('constructor validation', () => {
    it('should throw for missing SDK key', () => {
      expect(() => new FlagNetworkDataSource({ sdkKey: '' })).toThrow(
        '@vercel/flags-core: SDK key must be a string starting with "vf_"',
      );
    });

    it('should throw for SDK key not starting with vf_', () => {
      expect(
        () => new FlagNetworkDataSource({ sdkKey: 'invalid_key' }),
      ).toThrow(
        '@vercel/flags-core: SDK key must be a string starting with "vf_"',
      );
    });

    it('should throw for non-string SDK key', () => {
      expect(
        () => new FlagNetworkDataSource({ sdkKey: 123 as unknown as string }),
      ).toThrow(
        '@vercel/flags-core: SDK key must be a string starting with "vf_"',
      );
    });

    it('should accept valid SDK key', () => {
      expect(
        () => new FlagNetworkDataSource({ sdkKey: 'vf_valid_key' }),
      ).not.toThrow();
    });
  });

  describe('build step detection', () => {
    it('should detect build step when CI=1', async () => {
      process.env.CI = '1';

      const bundledDefinitions: BundledDefinitions = {
        projectId: 'bundled',
        definitions: { flag: { variants: [true] } },
        environment: 'production',
        updatedAt: 1,
        digest: 'a',
        revision: 1,
      };

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: bundledDefinitions,
        state: 'ok',
      });

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
      const result = await dataSource.read();

      // Should use bundled definitions without making stream request
      expect(result).toMatchObject(bundledDefinitions);
      expect(result.metrics.source).toBe('embedded');
      expect(result.metrics.cacheStatus).toBe('MISS');

      await dataSource.shutdown();
    });

    it('should detect build step when NEXT_PHASE=phase-production-build', async () => {
      process.env.NEXT_PHASE = 'phase-production-build';

      const bundledDefinitions: BundledDefinitions = {
        projectId: 'bundled',
        definitions: {},
        environment: 'production',
        updatedAt: 1,
        digest: 'a',
        revision: 1,
      };

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: bundledDefinitions,
        state: 'ok',
      });

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
      const result = await dataSource.read();

      expect(result).toMatchObject(bundledDefinitions);
      expect(result.metrics.source).toBe('embedded');

      await dataSource.shutdown();
    });

    it('should NOT detect build step when neither CI nor NEXT_PHASE is set', async () => {
      // Neither env var is set (cleared in beforeEach)
      let streamRequested = false;

      server.use(
        http.get('https://flags.vercel.com/v1/stream', () => {
          streamRequested = true;
          return new HttpResponse(
            createNdjsonStream([
              {
                type: 'datafile',
                data: { projectId: 'stream', definitions: {} },
              },
            ]),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
      await dataSource.read();

      expect(streamRequested).toBe(true);

      await dataSource.shutdown();
    });
  });

  describe('build step behavior', () => {
    it('should fall back to HTTP fetch when bundled definitions missing during build', async () => {
      process.env.CI = '1';

      const fetchedDefinitions = {
        projectId: 'fetched',
        definitions: { flag: true },
        environment: 'production',
      };

      // Bundled definitions not available
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: null,
        state: 'missing-file',
      });

      server.use(
        http.get('https://flags.vercel.com/v1/datafile', () => {
          return HttpResponse.json(fetchedDefinitions);
        }),
      );

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
      const result = await dataSource.read();

      expect(result).toMatchObject(fetchedDefinitions);
      expect(result.metrics.source).toBe('remote');
      expect(result.metrics.cacheStatus).toBe('MISS');

      await dataSource.shutdown();
    });

    it('should cache data after first build step read', async () => {
      process.env.CI = '1';

      const bundledDefinitions: BundledDefinitions = {
        projectId: 'bundled',
        definitions: {},
        environment: 'production',
        updatedAt: 1,
        digest: 'a',
        revision: 1,
      };

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: bundledDefinitions,
        state: 'ok',
      });

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });

      // First read
      const firstResult = await dataSource.read();
      expect(firstResult.metrics.cacheStatus).toBe('MISS');

      // Second read should use cached data
      const result = await dataSource.read();
      expect(result).toMatchObject(bundledDefinitions);
      expect(result.metrics.cacheStatus).toBe('HIT');

      // readBundledDefinitions should have been called only during construction
      expect(readBundledDefinitions).toHaveBeenCalledTimes(1);

      await dataSource.shutdown();
    });
  });

  describe('getFallbackDatafile', () => {
    it('should return bundled definitions when available', async () => {
      const bundledDefinitions: BundledDefinitions = {
        projectId: 'bundled',
        definitions: {},
        environment: 'production',
        updatedAt: 1,
        digest: 'a',
        revision: 1,
      };

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: bundledDefinitions,
        state: 'ok',
      });

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });

      const result = await dataSource.getFallbackDatafile();
      expect(result).toEqual(bundledDefinitions);

      await dataSource.shutdown();
    });

    it('should throw FallbackNotFoundError for missing-file state', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: null,
        state: 'missing-file',
      });

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });

      await expect(dataSource.getFallbackDatafile()).rejects.toThrow(
        'Bundled definitions file not found',
      );

      try {
        await dataSource.getFallbackDatafile();
      } catch (error) {
        expect((error as Error).name).toBe('FallbackNotFoundError');
      }

      await dataSource.shutdown();
    });

    it('should throw FallbackEntryNotFoundError for missing-entry state', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: null,
        state: 'missing-entry',
      });

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });

      await expect(dataSource.getFallbackDatafile()).rejects.toThrow(
        'No bundled definitions found for SDK key',
      );

      try {
        await dataSource.getFallbackDatafile();
      } catch (error) {
        expect((error as Error).name).toBe('FallbackEntryNotFoundError');
      }

      await dataSource.shutdown();
    });

    it('should throw for unexpected-error state', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: null,
        state: 'unexpected-error',
        error: new Error('Some error'),
      });

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });

      await expect(dataSource.getFallbackDatafile()).rejects.toThrow(
        'Failed to read bundled definitions',
      );

      await dataSource.shutdown();
    });
  });

  describe('getInfo', () => {
    it('should return metadata from cached data', async () => {
      server.use(
        http.get('https://flags.vercel.com/v1/stream', () => {
          return new HttpResponse(
            createNdjsonStream([
              {
                type: 'datafile',
                data: { projectId: 'cached-project', definitions: {} },
              },
            ]),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
      await dataSource.read(); // Cache data

      const metadata = await dataSource.getInfo();
      expect(metadata).toEqual({ projectId: 'cached-project' });

      await dataSource.shutdown();
    });

    it('should fetch metadata when no cached data', async () => {
      server.use(
        http.get('https://flags.vercel.com/v1/datafile', () => {
          return HttpResponse.json({
            projectId: 'fetched-project',
            definitions: {},
          });
        }),
      );

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });

      const metadata = await dataSource.getInfo();
      expect(metadata).toEqual({ projectId: 'fetched-project' });

      await dataSource.shutdown();
    });
  });

  describe('custom streamTimeoutMs', () => {
    it('should use custom timeout value', async () => {
      const bundledDefinitions: BundledDefinitions = {
        projectId: 'bundled',
        definitions: {},
        environment: 'production',
        updatedAt: 1,
        digest: 'a',
        revision: 1,
      };

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: bundledDefinitions,
        state: 'ok',
      });

      // Stream that never responds
      server.use(
        http.get('https://flags.vercel.com/v1/stream', () => {
          return new HttpResponse(new ReadableStream({ start() {} }), {
            headers: { 'Content-Type': 'application/x-ndjson' },
          });
        }),
      );

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        streamTimeoutMs: 500, // Much shorter timeout
      });

      const startTime = Date.now();
      const result = await dataSource.read();
      const elapsed = Date.now() - startTime;

      expect(result).toMatchObject(bundledDefinitions);
      expect(result.metrics.source).toBe('embedded');
      expect(result.metrics.cacheStatus).toBe('STALE');
      expect(elapsed).toBeGreaterThanOrEqual(450);
      expect(elapsed).toBeLessThan(1500);

      dataSource.shutdown();
    }, 5000);
  });
});
