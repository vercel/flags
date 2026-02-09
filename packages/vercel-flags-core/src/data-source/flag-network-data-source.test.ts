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
import type { BundledDefinitions, DatafileInput } from '../types';
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
          new TextEncoder().encode(`${JSON.stringify(message)}\n`),
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
                `${JSON.stringify({
                  type: 'datafile',
                  data: { projectId: 'test', definitions: {} },
                })}\n`,
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
    const part2 = `${fullMessage.slice(20)}\n`;

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
    expect(result.metrics.connectionState).toBe('connected');

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

    const dataSource = new FlagNetworkDataSource({
      sdkKey: 'vf_test_key',
      polling: false, // Disable polling to test stream timeout in isolation
    });

    // read should return bundledDefinitions after timeout (3s default)
    const startTime = Date.now();
    const result = await dataSource.read();
    const elapsed = Date.now() - startTime;

    // Should have returned bundled definitions with STALE status
    expect(result).toMatchObject({
      projectId: 'bundled-project',
      definitions: {},
      environment: 'production',
    });
    expect(result.metrics.source).toBe('embedded');
    expect(result.metrics.cacheStatus).toBe('STALE');
    expect(result.metrics.connectionState).toBe('disconnected');

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

    const dataSource = new FlagNetworkDataSource({
      sdkKey: 'vf_test_key',
      polling: false, // Disable polling to test stream error fallback in isolation
    });

    // Suppress expected error logs for this test
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await dataSource.read();

    expect(result).toMatchObject({
      projectId: 'bundled-project',
      definitions: {},
      environment: 'production',
    });
    expect(result.metrics.source).toBe('embedded');
    expect(result.metrics.cacheStatus).toBe('STALE');
    expect(result.metrics.connectionState).toBe('disconnected');

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
        definitions: {
          flag: { variants: [true], environments: {} },
        },
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
      expect(result.metrics.connectionState).toBe('disconnected');

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
      expect(result.metrics.connectionState).toBe('disconnected');

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

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
      });

      const result = await dataSource.getFallbackDatafile();
      expect(result).toEqual(bundledDefinitions);

      await dataSource.shutdown();
    });

    it('should throw FallbackNotFoundError for missing-file state', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        definitions: null,
        state: 'missing-file',
      });

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
      });

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

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
      });

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

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
      });

      await expect(dataSource.getFallbackDatafile()).rejects.toThrow(
        'Failed to read bundled definitions',
      );

      await dataSource.shutdown();
    });
  });

  describe('custom stream options', () => {
    it('should use custom initTimeoutMs value', async () => {
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
        stream: { initTimeoutMs: 500 }, // Much shorter timeout
        polling: false, // Disable polling to test stream timeout directly
      });

      const startTime = Date.now();
      const result = await dataSource.read();
      const elapsed = Date.now() - startTime;

      expect(result).toMatchObject({
        projectId: 'bundled',
        definitions: {},
        environment: 'production',
      });
      expect(result.metrics.source).toBe('embedded');
      expect(result.metrics.cacheStatus).toBe('STALE');
      expect(result.metrics.connectionState).toBe('disconnected');
      expect(elapsed).toBeGreaterThanOrEqual(450);
      expect(elapsed).toBeLessThan(1500);

      dataSource.shutdown();
    }, 5000);

    it('should disable stream when stream: false', async () => {
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
        http.get('https://flags.vercel.com/v1/datafile', () => {
          return HttpResponse.json({
            projectId: 'polled',
            definitions: {},
            environment: 'production',
          });
        }),
      );

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        stream: false,
        polling: true,
      });

      await dataSource.read();

      expect(streamRequested).toBe(false);

      await dataSource.shutdown();
    });
  });

  describe('polling options', () => {
    it('should use polling when enabled', async () => {
      let pollCount = 0;

      server.use(
        http.get('https://flags.vercel.com/v1/datafile', () => {
          pollCount++;
          return HttpResponse.json({
            projectId: 'polled',
            definitions: { count: pollCount },
            environment: 'production',
          });
        }),
      );

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        stream: false,
        polling: { intervalMs: 100, initTimeoutMs: 5000 },
      });

      const result = await dataSource.read();

      expect(result.projectId).toBe('polled');
      expect(pollCount).toBeGreaterThanOrEqual(1);

      // Wait for a few poll intervals
      await new Promise((r) => setTimeout(r, 350));

      expect(pollCount).toBeGreaterThanOrEqual(3);

      await dataSource.shutdown();
    });

    it('should disable polling when polling: false', async () => {
      let pollCount = 0;

      server.use(
        http.get('https://flags.vercel.com/v1/stream', () => {
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
        http.get('https://flags.vercel.com/v1/datafile', () => {
          pollCount++;
          return HttpResponse.json({
            projectId: 'polled',
            definitions: {},
            environment: 'production',
          });
        }),
      );

      const providedDatafile: DatafileInput = {
        projectId: 'static-data',
        definitions: {},
        environment: 'production',
      };

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        datafile: providedDatafile,
        stream: false,
        polling: false,
      });

      await dataSource.read();

      expect(pollCount).toBe(0);

      await dataSource.shutdown();
    });
  });

  describe('datafile option', () => {
    it('should use provided datafile immediately', async () => {
      server.use(
        http.get('https://flags.vercel.com/v1/stream', () => {
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

      const providedDatafile: DatafileInput = {
        projectId: 'provided',
        definitions: {},
        environment: 'production',
      };

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        datafile: providedDatafile,
      });

      // Should immediately return provided datafile
      const result = await dataSource.read();

      expect(result.projectId).toBe('provided');
      expect(result.metrics.source).toBe('in-memory');

      await dataSource.shutdown();
    });

    it('should work with datafile only (stream and polling disabled)', async () => {
      let streamRequested = false;
      let pollRequested = false;

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
        http.get('https://flags.vercel.com/v1/datafile', () => {
          pollRequested = true;
          return HttpResponse.json({
            projectId: 'polled',
            definitions: {},
            environment: 'production',
          });
        }),
      );

      const providedDatafile: DatafileInput = {
        projectId: 'static-data',
        definitions: { myFlag: { variants: [true, false], environments: {} } },
        environment: 'production',
      };

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        datafile: providedDatafile,
        stream: false,
        polling: false,
      });

      // Initialize and read
      await dataSource.initialize();
      const result = await dataSource.read();

      // Should use provided datafile
      expect(result.projectId).toBe('static-data');
      expect(result.definitions).toEqual({
        myFlag: { variants: [true, false], environments: {} },
      });

      // No network requests should have been made
      expect(streamRequested).toBe(false);
      expect(pollRequested).toBe(false);

      // Wait to ensure no delayed requests happen
      await new Promise((r) => setTimeout(r, 100));
      expect(streamRequested).toBe(false);
      expect(pollRequested).toBe(false);

      await dataSource.shutdown();
    });
  });

  describe('stream/polling coordination', () => {
    it('should stop polling when stream connects', async () => {
      let pollCount = 0;
      let streamDataSent = false;

      server.use(
        http.get('https://flags.vercel.com/v1/stream', async ({ request }) => {
          // Wait a bit to let polling start first
          await new Promise((r) => setTimeout(r, 200));
          return new HttpResponse(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `${JSON.stringify({
                      type: 'datafile',
                      data: { projectId: 'stream', definitions: {} },
                    })}\n`,
                  ),
                );
                streamDataSent = true;
                // Keep stream open
                request.signal.addEventListener('abort', () => {
                  controller.close();
                });
              },
            }),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
        http.get('https://flags.vercel.com/v1/datafile', () => {
          pollCount++;
          return HttpResponse.json({
            projectId: 'polled',
            definitions: { count: pollCount },
            environment: 'production',
          });
        }),
      );

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        stream: { initTimeoutMs: 100 }, // Short timeout to trigger polling fallback
        polling: { intervalMs: 50, initTimeoutMs: 5000 },
      });

      // This should initially get data from polling (stream times out)
      await dataSource.read();

      // Wait for stream data to be sent
      await vi.waitFor(
        () => {
          expect(streamDataSent).toBe(true);
        },
        { timeout: 2000 },
      );

      // Record poll count at this point
      const pollCountAfterStreamConnect = pollCount;

      // Wait for what would be several poll intervals
      await new Promise((r) => setTimeout(r, 200));

      // Polling should have stopped - count should not have increased much
      // (there might be 1-2 more polls in flight when stream connected)
      expect(pollCount).toBeGreaterThan(0);
      expect(pollCount).toBeLessThanOrEqual(pollCountAfterStreamConnect + 2);

      await dataSource.shutdown();
    });

    it('should fall back to polling when stream fails', async () => {
      let pollCount = 0;

      server.use(
        http.get('https://flags.vercel.com/v1/stream', () => {
          return new HttpResponse(null, { status: 500 });
        }),
        http.get('https://flags.vercel.com/v1/datafile', () => {
          pollCount++;
          return HttpResponse.json({
            projectId: 'polled',
            definitions: { count: pollCount },
            environment: 'production',
          });
        }),
      );

      // Suppress expected error logs
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        stream: { initTimeoutMs: 100 },
        polling: { intervalMs: 100, initTimeoutMs: 5000 },
      });

      const result = await dataSource.read();

      // Should have gotten data from polling
      expect(result.projectId).toBe('polled');
      expect(pollCount).toBeGreaterThanOrEqual(1);

      await dataSource.shutdown();

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should never stream and poll simultaneously when stream is connected', async () => {
      let streamRequestCount = 0;
      let pollRequestCount = 0;

      server.use(
        http.get('https://flags.vercel.com/v1/stream', ({ request }) => {
          streamRequestCount++;
          // Create a stream that stays open (simulating connected stream)
          return new HttpResponse(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `${JSON.stringify({
                      type: 'datafile',
                      data: { projectId: 'stream', definitions: {} },
                    })}\n`,
                  ),
                );
                // Keep stream open by not closing controller
                // Will be closed when test calls shutdown()
                request.signal.addEventListener('abort', () => {
                  controller.close();
                });
              },
            }),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
        http.get('https://flags.vercel.com/v1/datafile', () => {
          pollRequestCount++;
          return HttpResponse.json({
            projectId: 'polled',
            definitions: {},
            environment: 'production',
          });
        }),
      );

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        stream: true,
        polling: false, // Disable polling to test stream-only mode
      });

      await dataSource.read();

      // Stream should be used, polling should not be triggered
      expect(streamRequestCount).toBe(1);
      expect(pollRequestCount).toBe(0);

      // Wait to see if any polls happen
      await new Promise((r) => setTimeout(r, 200));

      // Still no polls should have happened
      expect(pollRequestCount).toBe(0);

      await dataSource.shutdown();
    });

    it('should use datafile immediately while starting background stream', async () => {
      let streamConnected = false;
      let dataUpdated = false;

      server.use(
        http.get('https://flags.vercel.com/v1/stream', async ({ request }) => {
          // Simulate slow stream connection
          await new Promise((r) => setTimeout(r, 200));
          streamConnected = true;
          return new HttpResponse(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `${JSON.stringify({
                      type: 'datafile',
                      data: {
                        projectId: 'stream',
                        definitions: { updated: true },
                      },
                    })}\n`,
                  ),
                );
                dataUpdated = true;
                // Keep stream open
                request.signal.addEventListener('abort', () => {
                  controller.close();
                });
              },
            }),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const providedDatafile: DatafileInput = {
        projectId: 'provided',
        definitions: {},
        environment: 'production',
      };

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        datafile: providedDatafile,
        stream: true,
        polling: false,
      });

      // Call initialize to start background updates
      await dataSource.initialize();

      // First read should be immediate (from provided datafile)
      const startTime = Date.now();
      const result = await dataSource.read();
      const elapsed = Date.now() - startTime;

      expect(result.projectId).toBe('provided');
      expect(elapsed).toBeLessThan(100); // Should be very fast
      expect(streamConnected).toBe(false); // Stream hasn't connected yet

      // Wait for stream to connect and update data
      await vi.waitFor(
        () => {
          expect(dataUpdated).toBe(true);
        },
        { timeout: 2000 },
      );

      // Now read should return stream data
      const updatedResult = await dataSource.read();
      expect(updatedResult.definitions).toEqual({ updated: true });
      expect(updatedResult.projectId).toBe('stream');

      await dataSource.shutdown();
    });
  });

  describe('getDatafile', () => {
    it('should fetch from network when called without initialize', async () => {
      const remoteDefinitions = {
        projectId: 'remote',
        definitions: { flag: true },
        environment: 'production',
      };

      server.use(
        http.get('https://flags.vercel.com/v1/datafile', () => {
          return HttpResponse.json(remoteDefinitions);
        }),
      );

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
      const result = await dataSource.getDatafile();

      expect(result).toMatchObject(remoteDefinitions);
      expect(result.metrics.source).toBe('remote');
      expect(result.metrics.cacheStatus).toBe('MISS');
      expect(result.metrics.connectionState).toBe('disconnected');

      await dataSource.shutdown();
    });

    it('should fetch from network even when bundled definitions exist (not in build step)', async () => {
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

      const remoteDefinitions = {
        projectId: 'remote',
        definitions: { flag: true },
        environment: 'production',
      };

      server.use(
        http.get('https://flags.vercel.com/v1/datafile', () => {
          return HttpResponse.json(remoteDefinitions);
        }),
      );

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
      const result = await dataSource.getDatafile();

      // Should fetch from network, NOT use bundled definitions
      expect(result.projectId).toBe('remote');
      expect(result.metrics.source).toBe('remote');
      expect(result.metrics.cacheStatus).toBe('MISS');

      await dataSource.shutdown();
    });

    it('should return cached data when stream is connected', async () => {
      const streamDefinitions = {
        projectId: 'stream',
        definitions: { flag: true },
      };

      server.use(
        http.get('https://flags.vercel.com/v1/stream', ({ request }) => {
          return new HttpResponse(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `${JSON.stringify({
                      type: 'datafile',
                      data: streamDefinitions,
                    })}\n`,
                  ),
                );
                request.signal.addEventListener('abort', () => {
                  controller.close();
                });
              },
            }),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });

      // First read via initialize/read to establish stream connection
      await dataSource.read();

      // getDatafile should return cached stream data
      const result = await dataSource.getDatafile();

      expect(result.projectId).toBe('stream');
      expect(result.metrics.source).toBe('in-memory');
      expect(result.metrics.cacheStatus).toBe('HIT');
      expect(result.metrics.connectionState).toBe('connected');

      await dataSource.shutdown();
    });

    it('should use getDataForBuildStep when in build step', async () => {
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
      const result = await dataSource.getDatafile();

      expect(result.projectId).toBe('bundled');
      expect(result.metrics.source).toBe('embedded');
      expect(result.metrics.cacheStatus).toBe('MISS');
      expect(result.metrics.connectionState).toBe('disconnected');

      await dataSource.shutdown();
    });

    it('should fetch fresh data on each call when stream is not connected', async () => {
      let fetchCount = 0;

      server.use(
        http.get('https://flags.vercel.com/v1/datafile', () => {
          fetchCount++;
          return HttpResponse.json({
            projectId: 'remote',
            definitions: { version: fetchCount },
            environment: 'production',
          });
        }),
      );

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        stream: false,
        polling: false,
      });

      const result1 = await dataSource.getDatafile();
      expect(result1.definitions).toEqual({ version: 1 });

      // The second call hits the cache since this.data was set by the first call
      // and the stream is not connected, so isStreamConnected is false
      // which means the else branch fires again, fetching fresh data
      const result2 = await dataSource.getDatafile();
      expect(result2.definitions).toEqual({ version: 2 });
      expect(fetchCount).toBe(2);

      await dataSource.shutdown();
    });
  });

  describe('buildStep option', () => {
    it('should always load bundled definitions regardless of buildStep', async () => {
      // bundled definitions are always loaded as ultimate fallback
      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        buildStep: false,
        stream: false,
        polling: false,
      });

      expect(readBundledDefinitions).toHaveBeenCalledWith('vf_test_key');

      await dataSource.shutdown();
    });

    it('should skip network when buildStep: true', async () => {
      let streamRequested = false;
      let pollRequested = false;

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
        http.get('https://flags.vercel.com/v1/datafile', () => {
          pollRequested = true;
          return HttpResponse.json({
            projectId: 'polled',
            definitions: {},
            environment: 'production',
          });
        }),
      );

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

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        buildStep: true, // Force build step behavior
        stream: true, // Would normally enable streaming
        polling: true, // Would normally enable polling
      });

      const result = await dataSource.read();

      // Should use bundled definitions, not network
      expect(result.projectId).toBe('bundled');
      expect(streamRequested).toBe(false);
      expect(pollRequested).toBe(false);

      await dataSource.shutdown();
    });

    it('should use datafile over bundled in build step', async () => {
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

      const providedDatafile: DatafileInput = {
        projectId: 'provided',
        definitions: {},
        environment: 'production',
      };

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        buildStep: true,
        datafile: providedDatafile,
      });

      const result = await dataSource.read();

      // Should prefer provided datafile over bundled
      expect(result.projectId).toBe('provided');

      await dataSource.shutdown();
    });

    it('should auto-detect build step when CI=1', async () => {
      process.env.CI = '1';

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

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        // buildStep not specified - should auto-detect from CI=1
      });

      const result = await dataSource.read();

      // Should use bundled (build step detected), not stream
      expect(result.projectId).toBe('bundled');
      expect(streamRequested).toBe(false);

      await dataSource.shutdown();
    });

    it('should auto-detect build step when NEXT_PHASE=phase-production-build', async () => {
      process.env.NEXT_PHASE = 'phase-production-build';

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

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        // buildStep not specified - should auto-detect from NEXT_PHASE
      });

      const result = await dataSource.read();

      // Should use bundled (build step detected), not stream
      expect(result.projectId).toBe('bundled');
      expect(streamRequested).toBe(false);

      await dataSource.shutdown();
    });

    it('should override auto-detection with buildStep: false', async () => {
      process.env.CI = '1'; // Would normally trigger build step

      server.use(
        http.get('https://flags.vercel.com/v1/stream', () => {
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

      const dataSource = new FlagNetworkDataSource({
        sdkKey: 'vf_test_key',
        buildStep: false, // Explicitly override CI detection
      });

      const result = await dataSource.read();

      // Should use stream (buildStep: false overrides CI detection)
      expect(result.projectId).toBe('stream');

      await dataSource.shutdown();
    });
  });
});
