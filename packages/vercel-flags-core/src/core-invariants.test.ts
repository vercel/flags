/**
 * Core Invariant Tests
 *
 * These tests verify fundamental behaviors that MUST be true for the flags client
 * to work correctly. They serve as a contract and safety net for core functionality.
 *
 * If any of these tests fail, the client is broken in a fundamental way.
 */

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
import { createClient, createRawClient } from '.';
import { FlagNetworkDataSource } from './data-source/flag-network-data-source';
import { InMemoryDataSource } from './data-source/in-memory-data-source';
import type { BundledDefinitions, BundledDefinitionsResult } from './types';

const server = setupServer(
  // Handle ingest requests to suppress MSW warnings
  http.post('https://flags.vercel.com/v1/ingest', () => {
    return HttpResponse.json({ ok: true });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function createNdjsonStream(messages: object[]): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      for (const message of messages) {
        controller.enqueue(
          new TextEncoder().encode(JSON.stringify(message) + '\n'),
        );
      }
      controller.close();
    },
  });
}

describe('Core Invariants: SDK Key Validation', () => {
  /**
   * The client must throw when no SDK key is provided.
   * Without an SDK key, the client cannot authenticate with the flags service.
   */
  it('createClient() throws when SDK key is empty string', () => {
    expect(() => createClient('')).toThrow('flags: Missing sdkKey');
  });

  it('createClient() throws when SDK key is invalid format', () => {
    expect(() => createClient('invalid-key')).toThrow('flags: Missing sdkKey');
  });

  it('createClient() throws when SDK key does not start with vf_', () => {
    expect(() => createClient('not_a_valid_key')).toThrow(
      'flags: Missing sdkKey',
    );
  });

  it('FlagNetworkDataSource throws when SDK key is empty', () => {
    expect(() => new FlagNetworkDataSource({ sdkKey: '' })).toThrow(
      '@vercel/flags-core: SDK key must be a string starting with "vf_"',
    );
  });

  it('FlagNetworkDataSource throws when SDK key does not start with vf_', () => {
    expect(() => new FlagNetworkDataSource({ sdkKey: 'invalid' })).toThrow(
      '@vercel/flags-core: SDK key must be a string starting with "vf_"',
    );
  });
});

describe('Core Invariants: ensureFallback Behavior', () => {
  /**
   * ensureFallback() must throw when no bundled definitions are present.
   * This ensures developers know when their fallback setup is broken.
   */
  it('ensureFallback() throws when bundled definitions file is missing', async () => {
    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    dataSource.bundledDefinitionsPromise =
      Promise.resolve<BundledDefinitionsResult>({
        state: 'missing-file',
      });

    await expect(dataSource.ensureFallback()).rejects.toThrow(
      'flags: No bundled definitions found. Run "vercel-flags prepare" during your build step.',
    );
  });

  it('ensureFallback() throws when SDK key entry is missing from bundled definitions', async () => {
    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    dataSource.bundledDefinitionsPromise =
      Promise.resolve<BundledDefinitionsResult>({
        state: 'missing-entry',
      });

    await expect(dataSource.ensureFallback()).rejects.toThrow(
      'flags: No bundled definitions found for SDK key "vf_test_key"',
    );
  });

  it('ensureFallback() succeeds when bundled definitions are present', async () => {
    const bundledDefinitions: BundledDefinitions = {
      projectId: 'test-project',
      definitions: {},
      environment: 'production',
      updatedAt: 1000,
      digest: 'aa',
      revision: 1,
    };

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    dataSource.bundledDefinitionsPromise =
      Promise.resolve<BundledDefinitionsResult>({
        definitions: bundledDefinitions,
        state: 'ok',
      });

    await expect(dataSource.ensureFallback()).resolves.toBeUndefined();
  });

  it('ensureFallback() throws on data source that does not support fallbacks', async () => {
    const inMemoryDataSource = new InMemoryDataSource({
      data: { definitions: {}, segments: {} },
      projectId: 'test',
      environment: 'production',
    });

    const client = createRawClient({ dataSource: inMemoryDataSource });

    await expect(client.ensureFallback()).rejects.toThrow(
      'flags: This data source does not support fallbacks',
    );
  });
});

describe('Core Invariants: Stream Timeout & Fallback', () => {
  /**
   * The client must fall back to bundled definitions when the stream cannot be opened.
   * This ensures the app can still function even when the flags service is unavailable.
   */
  it('falls back to bundled definitions when stream times out (respects streamInitTimeoutMs)', async () => {
    const bundledDefinitions: BundledDefinitions = {
      projectId: 'bundled-project',
      definitions: { 'fallback-flag': { variants: [true] } },
      environment: 'production',
      updatedAt: 1000,
      digest: 'aa',
      revision: 1,
    };

    // Stream that never sends data - simulates timeout
    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          new ReadableStream({
            start() {
              // Never enqueue anything - simulates hanging connection
            },
          }),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    dataSource.bundledDefinitionsPromise =
      Promise.resolve<BundledDefinitionsResult>({
        definitions: bundledDefinitions,
        state: 'ok',
      });

    const startTime = Date.now();
    const result = await dataSource.getData();
    const elapsed = Date.now() - startTime;

    // Should have returned bundled definitions
    expect(result).toEqual(bundledDefinitions);

    // Should have taken roughly 3 seconds (the default streamInitTimeoutMs)
    expect(elapsed).toBeGreaterThanOrEqual(2900);
    expect(elapsed).toBeLessThan(4000);

    dataSource.shutdown();
  }, 10000);

  it('falls back to bundled definitions on 4xx errors', async () => {
    const bundledDefinitions: BundledDefinitions = {
      projectId: 'bundled-project',
      definitions: {},
      environment: 'production',
      updatedAt: 1000,
      digest: 'aa',
      revision: 1,
    };

    // Return 401 - client error that stops retrying
    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(null, { status: 401 });
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    dataSource.bundledDefinitionsPromise =
      Promise.resolve<BundledDefinitionsResult>({
        definitions: bundledDefinitions,
        state: 'ok',
      });

    // Suppress expected error logs
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await dataSource.getData();

    expect(result).toEqual(bundledDefinitions);

    await dataSource.shutdown();
    errorSpy.mockRestore();
  });

  it('falls back to bundled definitions on 5xx errors (after timeout)', async () => {
    const bundledDefinitions: BundledDefinitions = {
      projectId: 'bundled-project',
      definitions: {},
      environment: 'production',
      updatedAt: 1000,
      digest: 'aa',
      revision: 1,
    };

    // Return 500 - server error that will retry but timeout first
    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    dataSource.bundledDefinitionsPromise =
      Promise.resolve<BundledDefinitionsResult>({
        definitions: bundledDefinitions,
        state: 'ok',
      });

    // Suppress expected error logs
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await dataSource.getData();

    expect(result).toEqual(bundledDefinitions);

    await dataSource.shutdown();
    errorSpy.mockRestore();
  });

  it('uses stream data when stream connects successfully', async () => {
    const streamDefinitions = {
      projectId: 'stream-project',
      definitions: { 'stream-flag': { variants: [true, false] } },
    };

    server.use(
      http.get('https://flags.vercel.com/v1/stream', () => {
        return new HttpResponse(
          createNdjsonStream([{ type: 'datafile', data: streamDefinitions }]),
          { headers: { 'Content-Type': 'application/x-ndjson' } },
        );
      }),
    );

    const dataSource = new FlagNetworkDataSource({ sdkKey: 'vf_test_key' });
    const result = await dataSource.getData();

    expect(result).toEqual(streamDefinitions);

    await dataSource.shutdown();
  });
});
