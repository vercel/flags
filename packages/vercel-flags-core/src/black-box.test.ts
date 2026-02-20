// extend client with concept of per-request data so we can set overrides?
// extend client with concept of request transaction so a single request is guaranteed consistent flag data?
//   could be unexpected if used in a workflow or stream or whatever

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamMessage } from './controller/stream-connection';
import { type BundledDefinitions, createClient } from './index.default';
import { readBundledDefinitions } from './utils/read-bundled-definitions';

vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(() =>
    Promise.resolve({ definitions: null, state: 'missing-file' }),
  ),
}));

const sdkKey = 'vf_fake';
const fetchMock = vi.fn<typeof fetch>();

/**
 * Creates a mock NDJSON stream response for testing.
 *
 * Returns a controller object that lets you gradually push messages
 * and a `response` promise suitable for use with a fetch mock.
 *
 * Usage:
 *   const stream = createMockStream();
 *   fetchMock.mockReturnValueOnce(stream.response);
 *   stream.push({ type: 'datafile', data: datafile });
 *   stream.close();
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

describe('Manual', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(readBundledDefinitions).mockReset();
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('buildStep', () => {
    it('uses the datafile if provided, even when bundled definitions exist', async () => {
      const passedDatafile: BundledDefinitions = {
        definitions: {
          flagA: {
            environments: {
              production: 1,
            },
            variants: [false, true],
          },
        },
        segments: {},
        environment: 'production',
        projectId: 'prj_123',
        configUpdatedAt: 2,
        digest: 'abc',
        revision: 2,
      };

      const bundledDatafile: BundledDefinitions = {
        definitions: {
          flagA: {
            environments: {
              production: 0,
            },
            variants: [false, true],
          },
        },
        segments: {},
        environment: 'production',
        projectId: 'prj_123',
        configUpdatedAt: 1,
        digest: 'abc',
        revision: 1,
      };

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
        // value is expected to be true instead of false, showing
        // the passed definition is used instead of the bundled one
        value: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();

      // flush
      await client.shutdown();

      // verify tracking
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://flags.vercel.com/v1/ingest',
        {
          body: expect.stringContaining('"type":"FLAGS_CONFIG_READ"'),
          headers: {
            Authorization: 'Bearer vf_fake',
            'Content-Type': 'application/json',
            'User-Agent': 'VercelFlagsCore/1.0.1',
          },
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

    it('uses the bundled definitions if no datafile is provided', async () => {
      const bundledDefinitions: BundledDefinitions = {
        definitions: {
          flagA: {
            environments: {
              production: 1,
            },
            variants: [false, true],
          },
        },
        segments: {},
        environment: 'production',
        projectId: 'prj_123',
        configUpdatedAt: 2,
        digest: 'abc',
        revision: 2,
      };

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: bundledDefinitions,
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
        // value is expected to be true instead of false, showing
        // the passed definition is used instead of the bundled one
        value: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();

      // flush
      await client.shutdown();

      // verify tracking
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://flags.vercel.com/v1/ingest',
        {
          body: expect.stringContaining('"type":"FLAGS_CONFIG_READ"'),
          headers: {
            Authorization: 'Bearer vf_fake',
            'Content-Type': 'application/json',
            'User-Agent': 'VercelFlagsCore/1.0.1',
          },
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

    it('returns defaultValue during build when no datafile and no bundled definitions are provided', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'missing-file',
        definitions: null,
      });

      const client = createClient(sdkKey, {
        buildStep: true,
        fetch: fetchMock,
      });

      // With defaultValue, evaluate should return it as an error result
      const result = await client.evaluate('flagA', false);

      expect(result).toEqual({
        value: false,
        reason: 'error',
        errorMessage: expect.stringContaining(
          'No flag definitions available during build',
        ),
      });

      // No network requests should have been made (no fetching during build)
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('failure behavior', () => {
    it('should return defaultValue when all data sources fail', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'missing-file',
        definitions: null,
      });

      // No stream, no polling, no datafile, no bundled
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
        errorMessage: expect.stringContaining('No flag definitions available'),
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
        'No flag definitions available',
      );
    });

    it('should use bundled definitions when stream and polling are disabled', async () => {
      const bundledDefinitions: BundledDefinitions = {
        definitions: {
          flagA: {
            environments: {
              production: 1,
            },
            variants: [false, true],
          },
        },
        segments: {},
        environment: 'production',
        projectId: 'prj_123',
        configUpdatedAt: 2,
        digest: 'abc',
        revision: 2,
      };

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: bundledDefinitions,
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

    it('should use constructor datafile when stream and polling are disabled', async () => {
      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'missing-file',
        definitions: null,
      });

      const datafile: BundledDefinitions = {
        definitions: {
          flagA: {
            environments: {
              production: 1,
            },
            variants: [false, true],
          },
        },
        segments: {},
        environment: 'production',
        projectId: 'prj_123',
        configUpdatedAt: 2,
        digest: 'abc',
        revision: 2,
      };

      const client = createClient(sdkKey, {
        buildStep: false,
        fetch: fetchMock,
        stream: false,
        polling: false,
        datafile,
      });

      const result = await client.evaluate('flagA');

      expect(result.value).toBe(true);
      expect(result.reason).toBe('paused');
      expect(result.metrics?.source).toBe('in-memory');
    });
  });

  describe('creating a client', () => {
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

  describe('initializing the client', () => {
    it('should init from the stream', async () => {
      const datafile = {
        definitions: {},
        segments: {},
        environment: 'production',
        projectId: 'prj_123',
        configUpdatedAt: 1,
        digest: 'abc',
        revision: 1,
      };

      const messageStream = createMockStream();

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          return messageStream.response;
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        buildStep: false,
        fetch: fetchMock,
      });

      const initPromise = client.initialize();

      messageStream.push({ type: 'datafile', data: datafile });
      await vi.advanceTimersByTimeAsync(0);

      await initPromise;

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]![0].toString()).toContain('/v1/stream');
    });

    it('should fall back to bundled when stream hangs', async () => {
      const datafile: BundledDefinitions = {
        definitions: {},
        segments: {},
        environment: 'production',
        projectId: 'prj_123',
        configUpdatedAt: 1,
        digest: 'abc',
        revision: 1,
      };

      vi.mocked(readBundledDefinitions).mockResolvedValue({
        state: 'ok',
        definitions: datafile,
      });

      fetchMock.mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/v1/stream')) {
          // stream opens but never sends initial data
          const body = new ReadableStream<Uint8Array>({ start() {} });
          return Promise.resolve(new Response(body, { status: 200 }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const client = createClient(sdkKey, {
        buildStep: false,
        fetch: fetchMock,
      });

      const initPromise = client.initialize();

      // Advance past the stream init timeout (3s)
      await vi.advanceTimersByTimeAsync(3_000);

      // Should fall back directly to bundled — no polling attempted
      await expect(initPromise).resolves.toBeUndefined();
    });
  });
});
