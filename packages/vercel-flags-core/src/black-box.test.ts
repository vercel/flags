/**
 * Black-box tests for controller behaviors.
 *
 * These tests verify the SDK's behavior exclusively through the public API
 * (createClient → evaluate/getDatafile/getFallbackDatafile/initialize/shutdown).
 * This allows internal refactoring without test breakage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamMessage } from './controller/stream-connection';
import { type BundledDefinitions, createClient } from './index.default';
import { internalReportValue } from './lib/report-value';
import { readBundledDefinitions } from './utils/read-bundled-definitions';

vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(() =>
    Promise.resolve({ definitions: null, state: 'missing-file' }),
  ),
}));

vi.mock('./lib/report-value', () => ({
  internalReportValue: vi.fn(),
}));

const sdkKey = 'vf_fake';
const fetchMock = vi.fn<typeof fetch>();

/**
 * Creates a mock NDJSON stream response for testing.
 *
 * Returns a controller object that lets you gradually push messages
 * and a `response` promise suitable for use with a fetch mock.
 */
function createMockStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  return {
    response: Promise.resolve(new Response(body, { status: 200 })),
    push(message: StreamMessage) {
      controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
    },
    close() {
      controller.close();
    },
  };
}

/** A simple bundled definitions fixture */
function makeBundled(
  overrides: Partial<BundledDefinitions> = {},
): BundledDefinitions {
  return {
    definitions: {
      flagA: {
        environments: { production: 1 },
        variants: [false, true],
      },
    },
    segments: {},
    environment: 'production',
    projectId: 'prj_123',
    configUpdatedAt: 1,
    digest: 'abc',
    revision: 1,
    ...overrides,
  };
}

const ingestRequestHeaders = Object.freeze({
  Authorization: 'Bearer vf_fake',
  'Content-Type': 'application/json',
  'User-Agent': 'VercelFlagsCore/1.0.1',
});

const streamRequestHeaders = Object.freeze({
  Authorization: 'Bearer vf_fake',
  'User-Agent': 'VercelFlagsCore/1.0.1',
  'X-Retry-Attempt': '0',
});

const datafileRequestHeaders = Object.freeze({
  Authorization: 'Bearer vf_fake',
  'User-Agent': 'VercelFlagsCore/1.0.1',
});

const originalEnv = { ...process.env };

describe('Controller (black-box)', () => {
  const date = new Date();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
    vi.mocked(readBundledDefinitions).mockReset();
    vi.mocked(internalReportValue).mockReset();
    fetchMock.mockReset();
    // Reset env vars that affect build step detection
    delete process.env.CI;
    delete process.env.NEXT_PHASE;
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  // ---------------------------------------------------------------------------
  // Constructor validation
  // ---------------------------------------------------------------------------
  describe('constructor validation', () => {
    it('should throw for missing SDK key', () => {
      expect(() =>
        createClient('', { fetch: fetchMock, stream: false, polling: false }),
      ).toThrow('@vercel/flags-core: Missing sdkKey');
    });

    it('should throw for SDK key not starting with vf_', () => {
      expect(() =>
        createClient('invalid_key', {
          fetch: fetchMock,
          stream: false,
          polling: false,
        }),
      ).toThrow('@vercel/flags-core: Missing sdkKey');
    });

    it('should throw for non-string SDK key', () => {
      expect(() =>
        createClient(123 as unknown as string, {
          fetch: fetchMock,
          stream: false,
          polling: false,
        }),
      ).toThrow(
        '@vercel/flags-core: Invalid sdkKey. Expected string, got number',
      );
    });

    it('should accept valid SDK key', () => {
      expect(() =>
        createClient('vf_valid_key', {
          fetch: fetchMock,
          stream: false,
          polling: false,
        }),
      ).not.toThrow();
    });

    it('should throw for polling interval below 30s', () => {
      expect(() =>
        createClient(sdkKey, {
          fetch: fetchMock,
          polling: { intervalMs: 1000, initTimeoutMs: 3000 },
        }),
      ).toThrow('Polling interval must be at least 30000ms');
    });
  });

  // ---------------------------------------------------------------------------
  // Build step detection
  // ---------------------------------------------------------------------------
  describe('build step detection', () => {
    it('should detect build step when CI=1', async () => {
      process.env.CI = '1';

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      const client = createClient(sdkKey, { fetch: fetchMock });
      const result = await client.evaluate('flagA');

      expect(result.metrics?.mode).toBe('build');
      expect(result.metrics?.source).toBe('embedded');
      // No network requests should have been made
      expect(fetchMock).not.toHaveBeenCalled();

      await client.shutdown();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://flags.vercel.com/v1/ingest',
        {
          body: JSON.stringify([
            {
              type: 'FLAGS_CONFIG_READ',
              ts: date.getTime(),
              payload: {
                configOrigin: 'embedded',
                cacheStatus: 'HIT',
                cacheAction: 'NONE',
                cacheIsFirstRead: true,
                cacheIsBlocking: false,
                duration: 0,
                configUpdatedAt: 1,
              },
            },
          ]),
          headers: ingestRequestHeaders,
          method: 'POST',
        },
      );
    });

    it('should detect build step when NEXT_PHASE=phase-production-build', async () => {
      process.env.NEXT_PHASE = 'phase-production-build';

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      const client = createClient(sdkKey, { fetch: fetchMock });
      const result = await client.evaluate('flagA');

      expect(result.metrics?.mode).toBe('build');
      expect(result.metrics?.source).toBe('embedded');
      expect(fetchMock).not.toHaveBeenCalled();

      await client.shutdown();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://flags.vercel.com/v1/ingest',
        {
          body: JSON.stringify([
            {
              type: 'FLAGS_CONFIG_READ',
              ts: date.getTime(),
              payload: {
                configOrigin: 'embedded',
                cacheStatus: 'HIT',
                cacheAction: 'NONE',
                cacheIsFirstRead: true,
                cacheIsBlocking: false,
                duration: 0,
                configUpdatedAt: 1,
              },
            },
          ]),
          headers: ingestRequestHeaders,
          method: 'POST',
        },
      );
    });

    it('should NOT detect build step when neither CI nor NEXT_PHASE is set', async () => {
      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, { fetch: fetchMock });
      const initPromise = client.initialize();

      stream.push({
        type: 'datafile',
        data: makeBundled({ projectId: 'stream' }),
      });
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      // Stream should have been attempted
      expect(fetchMock).toHaveBeenCalled();
      const streamCall = fetchMock.mock.calls.find((call) =>
        call[0]?.toString().includes('/v1/stream'),
      );
      expect(streamCall).toBeDefined();

      stream.close();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await client.shutdown();
      await vi.advanceTimersByTimeAsync(0);
      // Still 1 — shutdown flushes the usage tracker, but no evaluate()
      // was called, so there are no FLAGS_CONFIG_READ events to send.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should override auto-detection with buildStep: false', async () => {
      process.env.CI = '1'; // Would normally trigger build step

      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        buildStep: false, // Explicitly override CI detection
      });

      const initPromise = client.initialize();

      stream.push({
        type: 'datafile',
        data: makeBundled({ projectId: 'stream' }),
      });
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      const result = await client.evaluate('flagA');

      // Should use stream (buildStep: false overrides CI detection)
      expect(result.metrics?.mode).toBe('streaming');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await client.shutdown();
      stream.close();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://flags.vercel.com/v1/ingest',
        {
          body: JSON.stringify([
            {
              type: 'FLAGS_CONFIG_READ',
              ts: date.getTime(),
              payload: {
                configOrigin: 'in-memory',
                cacheStatus: 'HIT',
                cacheAction: 'FOLLOWING',
                cacheIsFirstRead: true,
                cacheIsBlocking: false,
                duration: 0,
                configUpdatedAt: 1,
              },
            },
          ]),
          headers: ingestRequestHeaders,
          method: 'POST',
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Build step behavior
  // ---------------------------------------------------------------------------
  describe('build step behavior', () => {
    it('should fall back to one-time fetch when bundled definitions missing during build', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'missing-file',
        definitions: null,
      });

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/datafile'))
          return Promise.resolve(Response.json(makeBundled()));
        return Promise.resolve(new Response('', { status: 200 }));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        buildStep: true,
      });

      // run two in parallel to ensure we still only track one read
      const [result] = await Promise.all([
        client.evaluate('flagA'),
        client.evaluate('flagB'),
      ]);

      expect(result.value).toBe(true);
      expect(result.metrics?.mode).toBe('build');
      expect(result.metrics?.source).toBe('remote');

      const fetchCall = fetchMock.mock.calls.find((call) =>
        call[0]?.toString().includes('/v1/datafile'),
      );
      expect(fetchCall).toBeDefined();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://flags.vercel.com/v1/datafile',
        {
          signal: expect.any(AbortSignal),
          headers: datafileRequestHeaders,
        },
      );

      await client.shutdown();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://flags.vercel.com/v1/ingest',
        {
          body: JSON.stringify([
            {
              type: 'FLAGS_CONFIG_READ',
              ts: date.getTime(),
              payload: {
                configOrigin: 'in-memory',
                cacheStatus: 'HIT',
                cacheAction: 'NONE',
                cacheIsFirstRead: true,
                cacheIsBlocking: false,
                duration: 0,
                configUpdatedAt: 1,
              },
            },
          ]),
          headers: ingestRequestHeaders,
          method: 'POST',
        },
      );
    });

    it('should throw when bundled definitions missing and fetch fails during build (no defaultValue)', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'missing-file',
        definitions: null,
      });

      fetchMock.mockRejectedValue(new Error('network error'));

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        buildStep: true,
      });

      await expect(client.evaluate('flagA')).rejects.toThrow(
        '@vercel/flags-core: No flag definitions available during build',
      );
    });

    it('should cache data after first build step read', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        buildStep: true,
      });

      const first = await client.evaluate('flagA');
      expect(first.metrics?.cacheStatus).toBe('HIT');

      const second = await client.evaluate('flagA');
      expect(second.metrics?.cacheStatus).toBe('HIT');

      // readBundledDefinitions should only be called once
      expect(readBundledDefinitions).toHaveBeenCalledTimes(1);

      await client.shutdown();
    });

    it('should skip network when buildStep: true even if stream/polling configured', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        buildStep: true,
        stream: true,
        polling: true,
      });

      const result = await client.evaluate('flagA');

      expect(result.metrics?.source).toBe('embedded');
      expect(result.metrics?.mode).toBe('build');
      expect(fetchMock).not.toHaveBeenCalled();

      await client.shutdown();
    });

    it('should use datafile over bundled in build step', async () => {
      const providedDatafile = makeBundled({
        configUpdatedAt: 2,
        definitions: {
          flagA: {
            environments: { production: 1 },
            variants: [false, true],
          },
        },
      });

      const bundled = makeBundled({
        configUpdatedAt: 1,
        definitions: {
          flagA: {
            environments: { production: 0 },
            variants: [false, true],
          },
        },
      });

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: bundled,
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        buildStep: true,
        datafile: providedDatafile,
      });

      const result = await client.evaluate('flagA');

      // value true means variant index 1 (from provided datafile), not 0 (bundled)
      expect(result.value).toBe(true);
      expect(result.metrics?.source).toBe('in-memory');

      await client.shutdown();
    });
  });

  // ---------------------------------------------------------------------------
  // Stream behavior
  // ---------------------------------------------------------------------------
  describe('stream behavior', () => {
    it('should handle messages split across chunks', async () => {
      const datafile = makeBundled({ projectId: 'test-project' });
      const fullMessage = JSON.stringify({
        type: 'datafile',
        data: datafile,
      });
      const part1 = fullMessage.slice(0, 20);
      const part2 = `${fullMessage.slice(20)}\n`;

      const encoder = new TextEncoder();
      let streamController: ReadableStreamDefaultController<Uint8Array>;

      const body = new ReadableStream<Uint8Array>({
        start(c) {
          streamController = c;
        },
      });

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          return Promise.resolve(new Response(body, { status: 200 }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, { fetch: fetchMock });
      const initPromise = client.initialize();

      // Send chunks separately
      streamController!.enqueue(encoder.encode(part1));
      await vi.advanceTimersByTimeAsync(10);
      streamController!.enqueue(encoder.encode(part2));
      await vi.advanceTimersByTimeAsync(0);

      await initPromise;

      const result = await client.evaluate('flagA');
      expect(result.value).toBe(true);
      expect(result.metrics?.source).toBe('in-memory');
      expect(result.metrics?.connectionState).toBe('connected');

      streamController!.close();
      await client.shutdown();
    });

    it('should update definitions when new datafile messages arrive', async () => {
      const datafile1 = makeBundled({
        revision: 1,
        configUpdatedAt: 1,
        definitions: {
          flagA: {
            environments: { production: 0 },
            variants: [false, true],
          },
        },
      });
      const datafile2 = makeBundled({
        revision: 2,
        configUpdatedAt: 2,
        definitions: {
          flagA: {
            environments: { production: 1 },
            variants: [false, true],
          },
        },
      });

      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, { fetch: fetchMock });
      const initPromise = client.initialize();

      stream.push({ type: 'datafile', data: datafile1 });
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      // First evaluate returns variant 0 (false)
      const result1 = await client.evaluate('flagA');
      expect(result1.value).toBe(false);

      // Push updated definitions
      stream.push({ type: 'datafile', data: datafile2 });
      await vi.advanceTimersByTimeAsync(0);

      // Second evaluate returns variant 1 (true)
      const result2 = await client.evaluate('flagA');
      expect(result2.value).toBe(true);

      stream.close();
      await client.shutdown();
    });

    it('should fall back to bundled when stream times out', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          // Stream opens but never sends data
          const body = new ReadableStream<Uint8Array>({ start() {} });
          return Promise.resolve(new Response(body, { status: 200 }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        polling: false,
      });

      const initPromise = client.initialize();

      // Advance past the stream init timeout (3s)
      await vi.advanceTimersByTimeAsync(3_000);
      await initPromise;

      const result = await client.evaluate('flagA');
      expect(result.value).toBe(true);
      expect(result.metrics?.source).toBe('embedded');
      expect(result.metrics?.connectionState).toBe('disconnected');

      expect(warnSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Stream initialization timeout, falling back',
      );
      warnSpy.mockRestore();
    });

    it('should fall back to bundled when stream errors (502)', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          return Promise.resolve(new Response(null, { status: 502 }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        polling: false,
      });

      const evalPromise = client.evaluate('flagA');

      // The 502 triggers stream error; init promise hangs until timeout
      await vi.advanceTimersByTimeAsync(3_000);

      const result = await evalPromise;
      expect(result.value).toBe(true);
      expect(result.metrics?.source).toBe('embedded');

      expect(errorSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Stream error',
        expect.any(Error),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Stream initialization timeout, falling back',
      );
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('should fast-fail on 401 without waiting for stream timeout', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          return Promise.resolve(new Response(null, { status: 401 }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const client = createClient(sdkKey, { fetch: fetchMock });

      const evalPromise = client.evaluate('flagA');

      // Only advance a tiny amount — well under the 3s stream timeout.
      // If the 401 fast-fail works, evaluate resolves without the full timeout.
      await vi.advanceTimersByTimeAsync(100);

      const result = await evalPromise;
      expect(result.value).toBe(true);
      expect(result.metrics?.source).toBe('embedded');

      errorSpy.mockRestore();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      await client.shutdown();
      await vi.advanceTimersByTimeAsync(0);
      // No ingest call — usage tracking is suppressed after a 401
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should use custom initTimeoutMs value', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          const body = new ReadableStream<Uint8Array>({ start() {} });
          return Promise.resolve(new Response(body, { status: 200 }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: { initTimeoutMs: 500 },
        polling: false,
      });

      const initPromise = client.initialize();

      // Advance only 500ms (custom timeout)
      await vi.advanceTimersByTimeAsync(500);
      await initPromise;

      const result = await client.evaluate('flagA');
      expect(result.metrics?.source).toBe('embedded');

      expect(warnSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Stream initialization timeout, falling back',
      );
      warnSpy.mockRestore();
    });

    it('should not spam the server when stream repeatedly connects then disconnects', async () => {
      const datafile = makeBundled();
      let streamRequestCount = 0;

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          streamRequestCount++;

          // Each stream connection sends a datafile (resetting retryCount)
          // then immediately closes — simulating a flapping connection
          const encoder = new TextEncoder();
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  `${JSON.stringify({ type: 'datafile', data: datafile })}\n`,
                ),
              );
              controller.close();
            },
          });
          return Promise.resolve(new Response(body, { status: 200 }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        polling: false,
      });

      await client.initialize();

      // Advance 10 seconds — without the minimum gap protection this would
      // cause an unbounded number of reconnections (retryCount resets to 0
      // after each datafile, and backoff(1)=0 gives immediate retry).
      // With the fix, reconnections are spaced at least 1s apart.
      await vi.advanceTimersByTimeAsync(10_000);

      // At most ~11 attempts in 10s (initial + 10 reconnections at 1s each)
      expect(streamRequestCount).toBeLessThanOrEqual(12);
      // But we should still see reconnection attempts happening
      expect(streamRequestCount).toBeGreaterThanOrEqual(2);

      await client.shutdown();
    });

    it('should disable stream when stream: false', async () => {
      const datafile = makeBundled();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/datafile')) {
          return Promise.resolve(Response.json(datafile));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: true,
      });

      await client.initialize();
      await vi.advanceTimersByTimeAsync(0);

      // No stream requests should have been made
      const streamCalls = fetchMock.mock.calls.filter((call) =>
        call[0]?.toString().includes('/v1/stream'),
      );
      expect(streamCalls).toHaveLength(0);

      await client.shutdown();
    });
  });

  // ---------------------------------------------------------------------------
  // Polling behavior
  // ---------------------------------------------------------------------------
  describe('polling behavior', () => {
    it('should use polling when enabled', async () => {
      let pollCount = 0;
      const datafile = makeBundled();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/datafile')) {
          pollCount++;
          return Promise.resolve(Response.json(datafile));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: { intervalMs: 30_000, initTimeoutMs: 5000 },
      });

      await client.initialize();

      expect(pollCount).toBeGreaterThanOrEqual(1);

      // Wait for a few poll intervals
      await vi.advanceTimersByTimeAsync(90_000);

      expect(pollCount).toBeGreaterThanOrEqual(3);

      await client.shutdown();
    });

    it('should disable polling when polling: false', async () => {
      const datafile = makeBundled();

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile,
      });

      await client.initialize();
      await vi.advanceTimersByTimeAsync(100);

      // No datafile fetch requests should have been made
      const pollCalls = fetchMock.mock.calls.filter((call) =>
        call[0]?.toString().includes('/v1/datafile'),
      );
      expect(pollCalls).toHaveLength(0);

      await client.shutdown();
    });
  });

  // ---------------------------------------------------------------------------
  // Datafile option
  // ---------------------------------------------------------------------------
  describe('datafile option', () => {
    it('should use provided datafile immediately', async () => {
      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const datafile = makeBundled({ projectId: 'provided' });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        datafile,
      });

      const result = await client.evaluate('flagA');
      expect(result.value).toBe(true);
      expect(result.metrics?.source).toBe('in-memory');

      stream.close();
      await client.shutdown();
    });

    it('should resolve initialize() immediately when datafile is provided', async () => {
      // Stream that never sends data — if init blocks on stream, this test hangs
      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          const body = new ReadableStream<Uint8Array>({ start() {} });
          return Promise.resolve(new Response(body, { status: 200 }));
        }
        return Promise.resolve(new Response('', { status: 200 }));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        datafile: makeBundled(),
      });

      // initialize() should resolve without advancing timers or stream data
      await client.initialize();

      const result = await client.evaluate('flagA');
      expect(result.value).toBe(true);
      expect(result.metrics?.source).toBe('in-memory');

      await client.shutdown();
    });

    it('should use provided datafile then update from polling', async () => {
      let pollCount = 0;

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/datafile')) {
          pollCount++;
          return Promise.resolve(
            Response.json(
              makeBundled({
                configUpdatedAt: 2,
                definitions: {
                  flagA: {
                    environments: { production: 0 },
                    variants: [false, true],
                  },
                },
              }),
            ),
          );
        }
        return Promise.resolve(new Response('', { status: 200 }));
      });

      const providedDatafile = makeBundled({
        configUpdatedAt: 1,
        definitions: {
          flagA: {
            environments: { production: 1 },
            variants: [false, true],
          },
        },
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: { intervalMs: 30_000, initTimeoutMs: 5000 },
        datafile: providedDatafile,
      });

      await client.initialize();

      // First evaluate uses provided datafile (variant 1 = true)
      const result1 = await client.evaluate('flagA');
      expect(result1.value).toBe(true);
      expect(result1.metrics?.source).toBe('in-memory');

      // Advance past a poll interval to trigger update
      await vi.advanceTimersByTimeAsync(30_000);

      expect(pollCount).toBeGreaterThanOrEqual(1);

      // Second evaluate uses polled data (variant 0 = false)
      const result2 = await client.evaluate('flagA');
      expect(result2.value).toBe(false);

      await client.shutdown();
    });

    it('should work with datafile only (stream and polling disabled)', async () => {
      const datafile = makeBundled();

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile,
      });

      await client.initialize();
      const result = await client.evaluate('flagA');

      expect(result.value).toBe(true);
      expect(result.metrics?.source).toBe('in-memory');

      // No network requests
      const networkCalls = fetchMock.mock.calls.filter(
        (call) =>
          call[0]?.toString().includes('/v1/stream') ||
          call[0]?.toString().includes('/v1/datafile'),
      );
      expect(networkCalls).toHaveLength(0);

      await client.shutdown();
    });
  });

  // ---------------------------------------------------------------------------
  // Stream/polling coordination
  // ---------------------------------------------------------------------------
  describe('stream/polling coordination', () => {
    it('should fall back to bundled when stream times out (skip polling)', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled({ projectId: 'bundled' }),
      });

      let pollCount = 0;

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          const body = new ReadableStream<Uint8Array>({ start() {} });
          return Promise.resolve(new Response(body, { status: 200 }));
        }
        if (url.includes('/v1/datafile')) {
          pollCount++;
          return Promise.resolve(
            Response.json(makeBundled({ projectId: 'polled' })),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: { initTimeoutMs: 100 },
        polling: { intervalMs: 30_000, initTimeoutMs: 5000 },
      });

      const initPromise = client.initialize();
      await vi.advanceTimersByTimeAsync(100);
      await initPromise;
      const after = new Date();

      const result = await client.evaluate('flagA');
      expect(result.metrics?.source).toBe('embedded');
      expect(pollCount).toBe(0);

      warnSpy.mockRestore();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      await client.shutdown();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://flags.vercel.com/v1/ingest',
        {
          body: JSON.stringify([
            {
              type: 'FLAGS_CONFIG_READ',
              ts: after.getTime(),
              payload: {
                configOrigin: 'embedded',
                cacheStatus: 'HIT',
                cacheAction: 'NONE',
                cacheIsFirstRead: true,
                cacheIsBlocking: false,
                duration: 0,
                configUpdatedAt: 1,
              },
            },
          ]),
          headers: {
            Authorization: 'Bearer vf_fake',
            'Content-Type': 'application/json',
            'User-Agent': 'VercelFlagsCore/1.0.1',
          },
          method: 'POST',
        },
      );
    });

    it('should fall back to bundled when stream fails (skip polling)', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled({ projectId: 'bundled' }),
      });

      let pollCount = 0;

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          return Promise.resolve(new Response(null, { status: 500 }));
        }
        if (url.includes('/v1/datafile')) {
          pollCount++;
          return Promise.resolve(
            Response.json(makeBundled({ projectId: 'polled' })),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const streamInitTimeoutMs = 1_500;
      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: { initTimeoutMs: streamInitTimeoutMs },
        polling: { intervalMs: 30_000, initTimeoutMs: 5000 },
      });

      // Stream retries with backoff; advance timers so the init timeout fires.
      // The minimum reconnection gap is 1s, so the first retry happens at ~1s.
      // With initTimeoutMs=1500 we get: attempt at t=0 (fail), retry at t=1000
      // (fail, backoff(2) >= 1s), timeout at t=1500 → fall back to bundled.
      const resultPromise = client.evaluate('flagA');
      await vi.advanceTimersByTimeAsync(1_600);
      const result = await resultPromise;
      expect(result.metrics?.source).toBe('embedded');
      expect(pollCount).toBe(0);

      errorSpy.mockRestore();
      warnSpy.mockRestore();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      await client.shutdown();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://flags.vercel.com/v1/ingest',
        {
          body: JSON.stringify([
            {
              type: 'FLAGS_CONFIG_READ',
              ts: date.getTime() + streamInitTimeoutMs,
              payload: {
                configOrigin: 'embedded',
                cacheStatus: 'HIT',
                cacheAction: 'NONE',
                cacheIsFirstRead: true,
                cacheIsBlocking: false,
                duration: 0,
                configUpdatedAt: 1,
              },
            },
          ]),
          headers: ingestRequestHeaders,
          method: 'POST',
        },
      );
    });

    it('should never stream and poll simultaneously when stream is connected', async () => {
      const stream = createMockStream();
      let pollCount = 0;

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        if (url.includes('/v1/datafile')) {
          pollCount++;
          return Promise.resolve(Response.json(makeBundled()));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, { fetch: fetchMock });

      const initPromise = client.initialize();

      stream.push({ type: 'datafile', data: makeBundled() });
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      // Wait to see if any polls happen
      await vi.advanceTimersByTimeAsync(60_000);

      expect(pollCount).toBe(0);

      stream.close();
      await client.shutdown();
    });

    it('should use datafile immediately while starting background stream', async () => {
      vi.useRealTimers(); // Need real timers for delayed stream

      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          return stream.response;
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const providedDatafile = makeBundled({
        projectId: 'provided',
        definitions: {
          flagA: {
            environments: { production: 0 },
            variants: [false, true],
          },
        },
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        datafile: providedDatafile,
      });

      // Initialize starts background stream connection
      await client.initialize();

      // First evaluate uses provided datafile immediately
      const result1 = await client.evaluate('flagA');
      expect(result1.value).toBe(false); // variant 0 from provided
      expect(result1.metrics?.source).toBe('in-memory');

      // Now push stream data (with newer configUpdatedAt)
      stream.push({
        type: 'datafile',
        data: makeBundled({
          projectId: 'stream',
          configUpdatedAt: 2,
          definitions: {
            flagA: {
              environments: { production: 1 },
              variants: [false, true],
            },
          },
        }),
      });

      // Wait for stream to deliver
      await new Promise((r) => setTimeout(r, 0));

      const result2 = await client.evaluate('flagA');
      expect(result2.value).toBe(true); // variant 1 from stream

      stream.close();
      await client.shutdown();
    });

    it('should not start polling from stream disconnect during initialization', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      let pollCount = 0;

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          return Promise.resolve(new Response(null, { status: 500 }));
        }
        if (url.includes('/v1/datafile')) {
          pollCount++;
          return Promise.resolve(Response.json(makeBundled()));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: { initTimeoutMs: 5000 },
        polling: { intervalMs: 30_000, initTimeoutMs: 5000 },
      });

      // Stream retries with backoff; advance timers so the init timeout fires
      const initPromise = client.initialize();
      await vi.advanceTimersByTimeAsync(5100);
      await initPromise;

      expect(pollCount).toBe(0);

      await client.shutdown();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // getDatafile
  // ---------------------------------------------------------------------------
  describe('getDatafile', () => {
    it('should return bundled definitions when called without initialize', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
      });

      const result = await client.getDatafile();
      expect(result.metrics.source).toBe('embedded');
      expect(result.metrics.cacheStatus).toBe('MISS');
      expect(result.metrics.connectionState).toBe('disconnected');

      await client.shutdown();
    });

    it('should fetch datafile when called without initialize and no bundled definitions', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'missing-file',
        definitions: null,
      });

      const fetchedDatafile = makeBundled({ projectId: 'fetched' });

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/datafile')) {
          return Promise.resolve(Response.json(fetchedDatafile));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
      });

      const result = await client.getDatafile();
      expect(result.metrics.source).toBe('remote');
      expect(result.metrics.cacheStatus).toBe('MISS');

      await client.shutdown();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://flags.vercel.com/v1/datafile',
        {
          headers: datafileRequestHeaders,
          signal: expect.any(AbortSignal),
        },
      );
    });

    it('should throw when called without initialize and all sources fail', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'missing-file',
        definitions: null,
      });

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/datafile')) {
          return Promise.resolve(new Response(null, { status: 500 }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
      });

      await expect(client.getDatafile()).rejects.toThrow(
        '@vercel/flags-core: No flag definitions available',
      );

      await client.shutdown();
    });

    it('should return cached data when stream is connected', async () => {
      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, { fetch: fetchMock });

      const initPromise = client.initialize();
      stream.push({ type: 'datafile', data: makeBundled() });
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      const result = await client.getDatafile();
      expect(result.metrics.source).toBe('in-memory');
      expect(result.metrics.cacheStatus).toBe('HIT');
      expect(result.metrics.connectionState).toBe('connected');

      stream.close();
      await client.shutdown();

      // no evaluate call so no usage tracking
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://flags.vercel.com/v1/stream',
        {
          headers: streamRequestHeaders,
          signal: expect.any(AbortSignal),
        },
      );
    });

    it('should use build step path when CI=1', async () => {
      process.env.CI = '1';

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      const client = createClient(sdkKey, { fetch: fetchMock });
      const result = await client.getDatafile();

      expect(result.metrics.source).toBe('embedded');
      expect(result.metrics.cacheStatus).toBe('MISS');

      await client.shutdown();
    });

    it('should return cached data on repeated calls', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
      });

      const result1 = await client.getDatafile();
      expect(result1.metrics).toEqual({
        cacheStatus: 'MISS',
        connectionState: 'disconnected',
        mode: 'offline',
        readMs: 0,
        source: 'embedded',
      });

      const result2 = await client.getDatafile();
      expect(result2.metrics).toEqual({
        cacheStatus: 'STALE',
        connectionState: 'disconnected',
        mode: 'offline',
        readMs: 0,
        source: 'embedded',
      });

      await client.shutdown();
    });
  });

  // ---------------------------------------------------------------------------
  // getFallbackDatafile
  // ---------------------------------------------------------------------------
  describe('getFallbackDatafile', () => {
    it('should return bundled definitions when available', async () => {
      const bundled = makeBundled();

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: bundled,
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
      });

      const result = await client.getFallbackDatafile();
      expect(result).toEqual(bundled);

      await client.shutdown();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should throw FallbackNotFoundError for missing-file state', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'missing-file',
        definitions: null,
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
      });

      await expect(client.getFallbackDatafile()).rejects.toThrow(
        'Bundled definitions file not found',
      );

      try {
        await client.getFallbackDatafile();
      } catch (error) {
        expect((error as Error).name).toBe('FallbackNotFoundError');
      }

      await client.shutdown();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should throw FallbackEntryNotFoundError for missing-entry state', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'missing-entry',
        definitions: null,
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
      });

      await expect(client.getFallbackDatafile()).rejects.toThrow(
        '@vercel/flags-core: No bundled definitions found for SDK key',
      );

      try {
        await client.getFallbackDatafile();
      } catch (error) {
        expect((error as Error).name).toBe('FallbackEntryNotFoundError');
      }

      await client.shutdown();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should throw for unexpected-error state', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'unexpected-error',
        definitions: null,
        error: new Error('Some error'),
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
      });

      await expect(client.getFallbackDatafile()).rejects.toThrow(
        '@vercel/flags-core: Failed to read bundled definitions',
      );

      await client.shutdown();
    });
  });

  // ---------------------------------------------------------------------------
  // configUpdatedAt guard
  // ---------------------------------------------------------------------------
  describe('configUpdatedAt guard', () => {
    it('should not overwrite newer data with older stream message', async () => {
      vi.useRealTimers();

      const newerDatafile = makeBundled({
        configUpdatedAt: 2000,
        definitions: {
          flagA: {
            environments: { production: 1 },
            variants: [false, true],
          },
        },
      });

      const olderDatafile = makeBundled({
        configUpdatedAt: 1000,
        definitions: {
          flagA: {
            environments: { production: 0 },
            variants: [false, true],
          },
        },
      });

      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        polling: false,
      });

      const initPromise = client.initialize();

      // Send newer data first
      stream.push({ type: 'datafile', data: newerDatafile });
      await new Promise((r) => setTimeout(r, 10));
      await initPromise;

      // Then send older data
      stream.push({ type: 'datafile', data: olderDatafile });
      await new Promise((r) => setTimeout(r, 50));

      // Should still have newer data (older message was rejected)
      const result = await client.evaluate('flagA');
      const after = new Date();
      expect(result.value).toBe(true); // variant 1 = newer

      stream.close();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://flags.vercel.com/v1/stream',
        {
          headers: streamRequestHeaders,
          signal: expect.any(AbortSignal),
        },
      );
      await client.shutdown();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://flags.vercel.com/v1/ingest',
        {
          method: 'POST',
          headers: ingestRequestHeaders,
          body: JSON.stringify([
            {
              type: 'FLAGS_CONFIG_READ',
              ts: after.getTime(),
              payload: {
                configOrigin: 'in-memory',
                cacheStatus: 'HIT',
                cacheAction: 'FOLLOWING',
                cacheIsFirstRead: true,
                cacheIsBlocking: false,
                duration: 0,
                configUpdatedAt: 2000,
              },
            },
          ]),
        },
      );
    });

    it('should skip stream data with equal configUpdatedAt', async () => {
      vi.useRealTimers();

      const data1 = makeBundled({
        configUpdatedAt: 1000,
        definitions: {
          flagA: {
            environments: { production: 0 },
            variants: [false, true],
          },
        },
      });

      const data2 = makeBundled({
        configUpdatedAt: 1000, // Same
        definitions: {
          flagA: {
            environments: { production: 1 },
            variants: [false, true],
          },
        },
      });

      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        polling: false,
      });

      const initPromise = client.initialize();

      stream.push({ type: 'datafile', data: data1 });
      await new Promise((r) => setTimeout(r, 10));
      await initPromise;

      stream.push({ type: 'datafile', data: data2 });
      await new Promise((r) => setTimeout(r, 50));

      // Should have kept first data (equal configUpdatedAt is not newer)
      const result = await client.evaluate('flagA');
      expect(result.value).toBe(false); // variant 0 = data1

      stream.close();
      await client.shutdown();
    });

    it('should accept updates when current data has no configUpdatedAt', async () => {
      vi.useRealTimers();

      const providedDatafile = makeBundled({
        definitions: {
          flagA: {
            environments: { production: 0 },
            variants: [false, true],
          },
        },
      });
      // Remove configUpdatedAt to simulate a plain DatafileInput
      delete (providedDatafile as Record<string, unknown>).configUpdatedAt;

      const streamData = makeBundled({
        configUpdatedAt: 1000,
        definitions: {
          flagA: {
            environments: { production: 1 },
            variants: [false, true],
          },
        },
      });

      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        datafile: providedDatafile,
        polling: false,
      });

      await client.initialize();

      // Initial evaluate uses provided datafile (variant 0)
      const result1 = await client.evaluate('flagA');
      expect(result1.value).toBe(false);

      // Push stream data with configUpdatedAt
      stream.push({ type: 'datafile', data: streamData });
      await new Promise((r) => setTimeout(r, 50));

      // Should accept stream data
      const result2 = await client.evaluate('flagA');
      expect(result2.value).toBe(true); // variant 1 = stream

      stream.close();
      await client.shutdown();
    });

    it('should handle configUpdatedAt as string', async () => {
      vi.useRealTimers();

      const newerDatafile = {
        ...makeBundled({
          definitions: {
            flagA: {
              environments: { production: 1 },
              variants: [false, true],
            },
          },
        }),
        configUpdatedAt: '2000' as unknown as number,
      };

      const olderDatafile = {
        ...makeBundled({
          definitions: {
            flagA: {
              environments: { production: 0 },
              variants: [false, true],
            },
          },
        }),
        configUpdatedAt: '1000' as unknown as number,
      };

      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        polling: false,
      });

      const initPromise = client.initialize();

      stream.push({ type: 'datafile', data: newerDatafile });
      await new Promise((r) => setTimeout(r, 10));
      await initPromise;

      stream.push({ type: 'datafile', data: olderDatafile });
      await new Promise((r) => setTimeout(r, 50));

      // Should still have newer data
      const result = await client.evaluate('flagA');
      expect(result.value).toBe(true); // variant 1 = newer

      stream.close();
      await client.shutdown();
    });

    it('should accept updates when configUpdatedAt is a non-numeric string', async () => {
      vi.useRealTimers();

      const currentData = {
        ...makeBundled({
          definitions: {
            flagA: {
              environments: { production: 0 },
              variants: [false, true],
            },
          },
        }),
        configUpdatedAt: 'not-a-number' as unknown as number,
      };

      const newData = makeBundled({
        configUpdatedAt: 1000,
        definitions: {
          flagA: {
            environments: { production: 1 },
            variants: [false, true],
          },
        },
      });

      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        polling: false,
      });

      const initPromise = client.initialize();

      stream.push({ type: 'datafile', data: currentData });
      await new Promise((r) => setTimeout(r, 10));
      await initPromise;

      stream.push({ type: 'datafile', data: newData });
      await new Promise((r) => setTimeout(r, 50));

      // Should accept update since current configUpdatedAt is unparseable
      const result = await client.evaluate('flagA');
      expect(result.value).toBe(true); // variant 1 = newData

      stream.close();
      await client.shutdown();
    });

    it('should not overwrite newer in-memory data via getDatafile', async () => {
      vi.useRealTimers();

      const newerDatafile = makeBundled({
        configUpdatedAt: 2000,
        definitions: {
          flagA: {
            environments: { production: 1 },
            variants: [false, true],
          },
        },
      });

      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        polling: false,
      });

      const initPromise = client.initialize();

      stream.push({ type: 'datafile', data: newerDatafile });
      await new Promise((r) => setTimeout(r, 10));
      await initPromise;

      // getDatafile and then evaluate — data should still be newer
      await client.getDatafile();

      const result = await client.evaluate('flagA');
      expect(result.value).toBe(true); // variant 1 = newer

      stream.close();
      await client.shutdown();
    });
  });

  // ---------------------------------------------------------------------------
  // Evaluate behavior
  // ---------------------------------------------------------------------------
  describe('evaluate behavior', () => {
    it('should return FLAG_NOT_FOUND with defaultValue for missing flag', async () => {
      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile: makeBundled(),
        buildStep: true,
      });

      const result = await client.evaluate('nonexistent-flag', 'default');

      expect(result.value).toBe('default');
      expect(result.reason).toBe('error');
      expect(result.errorCode).toBe('FLAG_NOT_FOUND');
      expect(result.errorMessage).toContain(
        '@vercel/flags-core: Definition not found for flag "nonexistent-flag"',
      );
    });

    it('should evaluate existing paused flag', async () => {
      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile: makeBundled(),
        buildStep: true,
      });

      const result = await client.evaluate('flagA');

      expect(result.value).toBe(true);
      expect(result.reason).toBe('paused');
    });

    it('should pass entities for targeting evaluation', async () => {
      const datafile = makeBundled({
        definitions: {
          'targeted-flag': {
            environments: {
              production: {
                // targets is the packed shorthand for targeting rules
                targets: [{}, { user: { id: ['user-123'] } }],
                fallthrough: 0,
              },
            },
            variants: ['default', 'targeted'],
          },
        },
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile,
        buildStep: true,
      });

      const result = await client.evaluate('targeted-flag', 'default', {
        user: { id: 'user-123' },
      });

      expect(result.value).toBe('targeted');
      expect(result.reason).toBe('target_match');
    });

    it('should use empty entities when not provided', async () => {
      const datafile = makeBundled({
        definitions: {
          'targeted-flag': {
            environments: {
              production: {
                targets: [{}, { user: { id: ['user-123'] } }],
                fallthrough: 0,
              },
            },
            variants: ['default', 'targeted'],
          },
        },
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile,
        buildStep: true,
      });

      const result = await client.evaluate('targeted-flag');

      expect(result.value).toBe('default');
      expect(result.reason).toBe('fallthrough');
    });

    it('should work with different value types', async () => {
      const datafile = makeBundled({
        definitions: {
          boolFlag: {
            environments: { production: 0 },
            variants: [true],
          },
          stringFlag: {
            environments: { production: 0 },
            variants: ['hello'],
          },
          numberFlag: {
            environments: { production: 0 },
            variants: [42],
          },
        },
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile,
        buildStep: true,
      });

      expect((await client.evaluate('boolFlag')).value).toBe(true);
      expect((await client.evaluate('stringFlag')).value).toBe('hello');
      expect((await client.evaluate('numberFlag')).value).toBe(42);
    });

    it('should call internalReportValue when projectId exists', async () => {
      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile: makeBundled({ projectId: 'my-project-id' }),
        buildStep: true,
      });

      await client.evaluate('flagA');

      expect(internalReportValue).toHaveBeenCalledWith('flagA', true, {
        originProjectId: 'my-project-id',
        originProvider: 'vercel',
        reason: 'paused',
        outcomeType: 'value',
      });
    });

    it('should not call internalReportValue when projectId is missing', async () => {
      const datafile = makeBundled();
      delete (datafile as Record<string, unknown>).projectId;

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile,
        buildStep: true,
      });

      await client.evaluate('flagA');

      expect(internalReportValue).not.toHaveBeenCalled();
    });

    it('should call internalReportValue with target_match reason', async () => {
      const datafile = makeBundled({
        projectId: 'my-project-id',
        definitions: {
          'targeted-flag': {
            environments: {
              production: {
                targets: [{}, { user: { id: ['user-123'] } }],
                fallthrough: 0,
              },
            },
            variants: ['default', 'targeted'],
          },
        },
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile,
        buildStep: true,
      });

      await client.evaluate('targeted-flag', 'default', {
        user: { id: 'user-123' },
      });

      expect(internalReportValue).toHaveBeenCalledWith(
        'targeted-flag',
        'targeted',
        {
          originProjectId: 'my-project-id',
          originProvider: 'vercel',
          reason: 'target_match',
          outcomeType: 'value',
        },
      );
    });

    it('should call internalReportValue with fallthrough reason', async () => {
      const datafile = makeBundled({
        projectId: 'my-project-id',
        definitions: {
          'targeted-flag': {
            environments: {
              production: {
                targets: [{}, { user: { id: ['user-123'] } }],
                fallthrough: 0,
              },
            },
            variants: ['default', 'targeted'],
          },
        },
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile,
        buildStep: true,
      });

      // No entities provided, so no target matches → fallthrough
      await client.evaluate('targeted-flag');

      expect(internalReportValue).toHaveBeenCalledWith(
        'targeted-flag',
        'default',
        {
          originProjectId: 'my-project-id',
          originProvider: 'vercel',
          reason: 'fallthrough',
          outcomeType: 'value',
        },
      );
    });

    it('should not include outcomeType for error reason in internalReportValue', async () => {
      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile: makeBundled({ projectId: 'my-project-id' }),
        buildStep: true,
      });

      await client.evaluate('nonexistent-flag', 'fallback');

      expect(internalReportValue).toHaveBeenCalledWith(
        'nonexistent-flag',
        'fallback',
        {
          originProjectId: 'my-project-id',
          originProvider: 'vercel',
          reason: 'error',
        },
      );
      // Verify outcomeType is NOT present in the call
      const callArgs = vi.mocked(internalReportValue).mock.calls[0];
      expect(callArgs?.[2]).not.toHaveProperty('outcomeType');
    });

    it('should call internalReportValue with error reason when flag is not found', async () => {
      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile: makeBundled({ projectId: 'my-project-id' }),
        buildStep: true,
      });

      await client.evaluate('nonexistent-flag', 'default');

      expect(internalReportValue).toHaveBeenCalledWith(
        'nonexistent-flag',
        'default',
        {
          originProjectId: 'my-project-id',
          originProvider: 'vercel',
          reason: 'error',
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrent initialization
  // ---------------------------------------------------------------------------
  describe('concurrent initialization', () => {
    it('should deduplicate concurrent initialize() calls', async () => {
      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, { fetch: fetchMock });

      // Call initialize three times concurrently
      const p1 = client.initialize();
      const p2 = client.initialize();
      const p3 = client.initialize();

      stream.push({ type: 'datafile', data: makeBundled() });
      await vi.advanceTimersByTimeAsync(0);

      await Promise.all([p1, p2, p3]);

      // Stream should have been fetched only once
      const streamCalls = fetchMock.mock.calls.filter((call) =>
        call[0]?.toString().includes('/v1/stream'),
      );
      expect(streamCalls).toHaveLength(1);

      stream.close();
      await client.shutdown();
      await vi.advanceTimersByTimeAsync(0);

      // didn't evaluate any flags, so no config reads tracked
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate concurrent evaluate() calls that trigger initialize', async () => {
      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, { fetch: fetchMock });

      // Three concurrent evaluates trigger lazy initialization
      const p1 = client.evaluate('flagA');
      const p2 = client.evaluate('flagA');
      const p3 = client.evaluate('flagA');

      stream.push({ type: 'datafile', data: makeBundled() });
      await vi.advanceTimersByTimeAsync(0);

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      // All should have the same value
      expect(r1.value).toBe(true);
      expect(r2.value).toBe(true);
      expect(r3.value).toBe(true);

      // Stream should have been fetched only once
      const streamCalls = fetchMock.mock.calls.filter((call) =>
        call[0]?.toString().includes('/v1/stream'),
      );
      expect(streamCalls).toHaveLength(1);

      stream.close();
      await client.shutdown();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://flags.vercel.com/v1/ingest',
        {
          body: JSON.stringify([
            {
              type: 'FLAGS_CONFIG_READ',
              ts: date.getTime(),
              payload: {
                configOrigin: 'in-memory',
                cacheStatus: 'HIT',
                cacheAction: 'FOLLOWING',
                cacheIsFirstRead: true,
                cacheIsBlocking: false,
                duration: 0,
                configUpdatedAt: 1,
              },
            },
            {
              type: 'FLAGS_CONFIG_READ',
              ts: date.getTime(),
              payload: {
                configOrigin: 'in-memory',
                cacheStatus: 'HIT',
                cacheAction: 'FOLLOWING',
                cacheIsBlocking: false,
                duration: 0,
                configUpdatedAt: 1,
              },
            },
            {
              type: 'FLAGS_CONFIG_READ',
              ts: date.getTime(),
              payload: {
                configOrigin: 'in-memory',
                cacheStatus: 'HIT',
                cacheAction: 'FOLLOWING',
                cacheIsBlocking: false,
                duration: 0,
                configUpdatedAt: 1,
              },
            },
          ]),
          headers: ingestRequestHeaders,
          method: 'POST',
        },
      );
    });

    it('should start only one retry loop when concurrent evaluate() calls hit a failing stream', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          // Stream returns 502 — triggers retry loop
          return Promise.resolve(new Response(null, { status: 502 }));
        }
        return Promise.resolve(new Response('', { status: 200 }));
      });

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: { initTimeoutMs: 1_500 },
        polling: false,
      });

      // Three concurrent evaluates all trigger lazy initialization
      const p1 = client.evaluate('flagA');
      const p2 = client.evaluate('flagA');
      const p3 = client.evaluate('flagA');

      // Advance past the stream init timeout.
      // The minimum reconnection gap is 1s, so: attempt at t=0 (fail),
      // retry at t=1000 (fail, backoff(2) >= 1s), timeout at t=1500.
      await vi.advanceTimersByTimeAsync(1_500);

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      // All should resolve (falling back to bundled after stream timeout)
      expect(r1.value).toBe(true);
      expect(r2.value).toBe(true);
      expect(r3.value).toBe(true);

      // Concurrent callers share the same init promise, so only one retry
      // loop is started. With 1500ms timeout: attempt at retryCount=0 fails,
      // minimum gap enforces 1s delay → retry at retryCount=1 fails at t=1000,
      // backoff(2) >= 1s exceeds remaining timeout → falls back to bundled.
      // So exactly 2 stream attempts (one loop, two iterations).
      const streamCalls = fetchMock.mock.calls.filter((call) =>
        call[0]?.toString().includes('/v1/stream'),
      );
      expect(streamCalls).toHaveLength(2);
      // Verify only one retry loop: all stream calls should have sequential
      // X-Retry-Attempt headers (0, 1) from a single loop
      const h0 = streamCalls[0]?.[1]?.headers as Record<string, string>;
      const h1 = streamCalls[1]?.[1]?.headers as Record<string, string>;
      expect(h0['X-Retry-Attempt']).toBe('0');
      expect(h1['X-Retry-Attempt']).toBe('1');

      expect(errorSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Stream error',
        expect.any(Error),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '@vercel/flags-core: Stream initialization timeout, falling back',
      );
      errorSpy.mockRestore();
      warnSpy.mockRestore();

      await client.shutdown();
    });

    it('should allow re-initialization after failure', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'missing-file',
        definitions: null,
      });

      let fetchCallCount = 0;

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/datafile')) {
          fetchCallCount++;
          if (fetchCallCount === 1) {
            // First fetch fails
            return Promise.resolve(new Response(null, { status: 500 }));
          }
          // Second fetch succeeds
          return Promise.resolve(Response.json(makeBundled()));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
      });

      // First initialize fails (no bundled, fetch returns 500)
      await expect(client.initialize()).rejects.toThrow();

      // Second initialize should retry — fetch now succeeds
      await client.initialize();

      const result = await client.evaluate('flagA');
      expect(result.value).toBe(true);

      await client.shutdown();
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple clients
  // ---------------------------------------------------------------------------
  describe('multiple clients', () => {
    it('should maintain independent state for each client', async () => {
      const datafileA = makeBundled({
        definitions: {
          flagA: {
            environments: { production: 0 },
            variants: ['a-value', 'b-value'],
          },
        },
      });

      const datafileB = makeBundled({
        definitions: {
          flagA: {
            environments: { production: 1 },
            variants: ['a-value', 'b-value'],
          },
        },
      });

      const clientA = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile: datafileA,
        buildStep: true,
      });

      const clientB = createClient(sdkKey, {
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile: datafileB,
        buildStep: true,
      });

      const resultA = await clientA.evaluate('flagA');
      const resultB = await clientB.evaluate('flagA');

      expect(resultA.value).toBe('a-value');
      expect(resultB.value).toBe('b-value');

      // Shutdown one, other should still work
      await clientA.shutdown();

      const resultB2 = await clientB.evaluate('flagA');
      expect(resultB2.value).toBe('b-value');

      await clientB.shutdown();
    });
  });

  // ---------------------------------------------------------------------------
  // Lazy initialization
  // ---------------------------------------------------------------------------
  describe('lazy initialization', () => {
    it('should not load bundled definitions or stream or poll on creation', () => {
      const client = createClient(sdkKey, {
        buildStep: false,
        fetch: fetchMock,
      });

      expect(client).toBeDefined();
      expect(fetchMock).not.toHaveBeenCalled();
      // Bundled definitions are loaded lazily, not at construction time
      expect(readBundledDefinitions).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Failure behavior (no sources)
  // ---------------------------------------------------------------------------
  describe('failure behavior (no sources)', () => {
    it('should return defaultValue when all data sources fail', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'missing-file',
        definitions: null,
      });

      const client = createClient(sdkKey, {
        buildStep: false,
        fetch: fetchMock,
        stream: false,
        polling: false,
      });

      const result = await client.evaluate('flagA', false);

      expect(result).toEqual({
        value: false,
        reason: 'error',
        errorMessage: expect.stringContaining(
          '@vercel/flags-core: No flag definitions available',
        ),
      });
    });

    it('should throw when all data sources fail and no defaultValue provided', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'missing-file',
        definitions: null,
      });

      const client = createClient(sdkKey, {
        buildStep: false,
        fetch: fetchMock,
        stream: false,
        polling: false,
      });

      await expect(client.evaluate('flagA')).rejects.toThrow(
        '@vercel/flags-core: No flag definitions available',
      );
    });

    it('should use bundled definitions when stream and polling are disabled', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled(),
      });

      const client = createClient(sdkKey, {
        buildStep: false,
        fetch: fetchMock,
        stream: false,
        polling: false,
      });

      const result = await client.evaluate('flagA');

      expect(result.value).toBe(true);
      expect(result.reason).toBe('paused');
      expect(result.metrics?.source).toBe('embedded');
    });
  });

  // ---------------------------------------------------------------------------
  // Usage tracking
  // ---------------------------------------------------------------------------
  describe('usage tracking', () => {
    it('should report FLAGS_CONFIG_READ when using provided datafile in build step', async () => {
      const passedDatafile = makeBundled({
        configUpdatedAt: 2,
        revision: 2,
        definitions: {
          flagA: {
            environments: { production: 1 },
            variants: [false, true],
          },
        },
      });

      const bundledDatafile = makeBundled({
        configUpdatedAt: 1,
        revision: 1,
        definitions: {
          flagA: {
            environments: { production: 0 },
            variants: [false, true],
          },
        },
      });

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: bundledDatafile,
      });

      const client = createClient(sdkKey, {
        buildStep: true,
        fetch: fetchMock,
        datafile: passedDatafile,
      });

      await expect(client.evaluate('flagA')).resolves.toEqual({
        metrics: {
          cacheStatus: 'HIT',
          connectionState: 'disconnected',
          mode: 'build',
          evaluationMs: 0,
          readMs: 0,
          source: 'in-memory',
        },
        outcomeType: 'value',
        reason: 'paused',
        value: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();

      await client.shutdown();

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://flags.vercel.com/v1/ingest',
        {
          body: expect.stringContaining('"type":"FLAGS_CONFIG_READ"'),
          headers: ingestRequestHeaders,
          method: 'POST',
        },
      );
      expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual([
        {
          payload: {
            cacheAction: 'NONE',
            cacheIsBlocking: false,
            cacheIsFirstRead: true,
            cacheStatus: 'HIT',
            configOrigin: 'in-memory',
            configUpdatedAt: 2,
            duration: 0,
          },
          ts: expect.any(Number),
          type: 'FLAGS_CONFIG_READ',
        },
      ]);
    });

    it('should only track one FLAGS_CONFIG_READ during build step', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled({ configUpdatedAt: 1 }),
      });

      const client = createClient(sdkKey, {
        buildStep: true,
        fetch: fetchMock,
      });

      // Multiple evaluates during build
      await client.evaluate('flagA');
      await client.evaluate('flagA');
      await client.evaluate('flagA');

      await client.shutdown();

      // Only one ingest call, despite multiple evaluate() calls
      const ingestCalls = fetchMock.mock.calls.filter((call) =>
        call[0]?.toString().includes('/v1/ingest'),
      );
      expect(ingestCalls).toHaveLength(1);

      const events = JSON.parse(ingestCalls[0]?.[1]?.body as string);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('FLAGS_CONFIG_READ');
    });

    it('should report FLAGS_CONFIG_READ with FOLLOWING cacheAction when streaming', async () => {
      const stream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) return stream.response;
        if (url.includes('/v1/ingest')) {
          return Promise.resolve(new Response(null, { status: 200 }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        fetch: fetchMock,
        polling: false,
      });

      const initPromise = client.initialize();

      stream.push({
        type: 'datafile',
        data: makeBundled({ configUpdatedAt: 5 }),
      });
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      // Evaluate while streaming
      await client.evaluate('flagA');

      await client.shutdown();

      const ingestCalls = fetchMock.mock.calls.filter((call) =>
        call[0]?.toString().includes('/v1/ingest'),
      );
      expect(ingestCalls.length).toBeGreaterThanOrEqual(1);

      const events = JSON.parse(ingestCalls[0]?.[1]?.body as string);
      const readEvent = events.find(
        (e: { type: string }) => e.type === 'FLAGS_CONFIG_READ',
      );
      expect(readEvent).toBeDefined();
      expect(readEvent.payload.cacheAction).toBe('FOLLOWING');
      expect(readEvent.payload.configOrigin).toBe('in-memory');
      expect(readEvent.payload.cacheIsFirstRead).toBe(true);
      expect(readEvent.payload.configUpdatedAt).toBe(5);

      stream.close();
    });

    it('should report FLAGS_CONFIG_READ when using bundled definitions in build step', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: makeBundled({ configUpdatedAt: 2, revision: 2 }),
      });

      const client = createClient(sdkKey, {
        buildStep: true,
        fetch: fetchMock,
      });

      await expect(client.evaluate('flagA')).resolves.toEqual({
        metrics: {
          cacheStatus: 'HIT',
          connectionState: 'disconnected',
          mode: 'build',
          evaluationMs: 0,
          readMs: 0,
          source: 'embedded',
        },
        outcomeType: 'value',
        reason: 'paused',
        value: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();

      await client.shutdown();

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://flags.vercel.com/v1/ingest',
        {
          body: expect.stringContaining('"type":"FLAGS_CONFIG_READ"'),
          headers: ingestRequestHeaders,
          method: 'POST',
        },
      );
      expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual([
        {
          payload: {
            cacheAction: 'NONE',
            cacheIsBlocking: false,
            cacheIsFirstRead: true,
            cacheStatus: 'HIT',
            configOrigin: 'embedded',
            configUpdatedAt: 2,
            duration: 0,
          },
          ts: expect.any(Number),
          type: 'FLAGS_CONFIG_READ',
        },
      ]);
    });
  });
});
