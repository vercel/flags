// extend client with concept of per-request data so we can set overrides?
// extend client with concept of request transaction so a single request is guaranteed consistent flag data?
//   could be unexpected if used in a workflow or stream or whatever

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
import type { StreamMessage } from './controller/stream-connection';
import { type BundledDefinitions, createClient } from './index.default';

vi.mock('./utils/read-bundled-definitions', () => ({
  readBundledDefinitions: vi.fn(() =>
    Promise.resolve({ definitions: null, state: 'missing-file' }),
  ),
}));

import { readBundledDefinitions } from './utils/read-bundled-definitions';

const host = 'https://flags.vercel.com';
const sdkKey = 'vf_fake';
const fetchMock = vi.fn(fetch);

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.mocked(readBundledDefinitions).mockReset();
  vi.mocked(readBundledDefinitions).mockResolvedValue({
    definitions: null,
    state: 'missing-file',
  });
  fetchMock.mockClear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * Creates a mock NDJSON stream response for testing.
 *
 * Returns a controller object that lets you gradually push messages
 * and a Response suitable for use with an MSW handler.
 *
 * Usage:
 *   const stream = createMockStream();
 *   server.use(http.get(url, () => stream.response));
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
    response: new HttpResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    }),
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('creating a client', () => {
    it('should only load the bundled definitions but not stream or poll', () => {
      let streamRequested = false;
      let pollRequested = false;
      let usageReported = false;

      server.use(
        http.get(`${host}/v1/stream`, () => {
          streamRequested = true;
          return new HttpResponse(null, { status: 200 });
        }),
        http.get(`${host}/v1/datafile`, () => {
          pollRequested = true;
          return HttpResponse.json({});
        }),
        http.get(`${host}/v1/usage`, () => {
          usageReported = true;
          return HttpResponse.json({});
        }),
      );

      const client = createClient(sdkKey, {
        buildStep: false,
        fetch: fetchMock,
      });

      expect(client).toBeDefined();
      expect(streamRequested).toBe(false);
      expect(pollRequested).toBe(false);
      expect(usageReported).toBe(false);
      expect(readBundledDefinitions).toHaveBeenCalledWith(sdkKey);
      expect(fetchMock).toHaveBeenCalledTimes(0);
    });
  });

  describe('initializing the client', () => {
    it('should init from the stream', async () => {
      let streamRequested = false;

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

      server.use(
        http.get(`${host}/v1/stream`, () => {
          streamRequested = true;
          return messageStream.response;
        }),
      );

      messageStream.push({ type: 'datafile', data: datafile });

      const client = createClient(sdkKey, {
        buildStep: false,
        fetch: fetchMock,
      });

      await client.initialize();

      expect(streamRequested).toBe(true);

      messageStream.close();
      await client.shutdown();
    });

    it('should fall back to bundled when stream and poll hangs', async () => {
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

      let pollCount = 0;

      server.use(
        // stream opens but never sends initial data
        http.get(`${host}/v1/stream`, () => {
          return new HttpResponse(new ReadableStream({ start() {} }), {
            headers: { 'Content-Type': 'application/x-ndjson' },
          });
        }),
        // polling request starts but never resolves
        http.get(`${host}/v1/datafile`, () => {
          pollCount++;
          return new Promise<never>(() => {});
        }),
      );

      const client = createClient(sdkKey, {
        buildStep: false,
      });

      const initPromise = client.initialize();

      // Advance past the stream init timeout (3s) and polling init timeout (3s)
      await vi.advanceTimersByTimeAsync(1_000);
      expect(pollCount).toBe(0);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(pollCount).toBe(1);
      await vi.advanceTimersByTimeAsync(3_000);

      // wait for init to resolve
      await expect(initPromise).resolves.toBeUndefined();
    });

    it('should fall back to polling without double-polling when stream hangs', async () => {
      const datafile: BundledDefinitions = {
        definitions: {},
        segments: {},
        environment: 'production',
        projectId: 'prj_123',
        configUpdatedAt: 1,
        digest: 'abc',
        revision: 1,
      };

      let pollCount = 0;

      server.use(
        // stream opens but never sends initial data
        http.get(`${host}/v1/stream`, () => {
          return new HttpResponse(new ReadableStream({ start() {} }), {
            headers: { 'Content-Type': 'application/x-ndjson' },
          });
        }),
        // polling returns a valid datafile
        http.get(`${host}/v1/datafile`, () => {
          pollCount++;
          return HttpResponse.json(datafile);
        }),
      );

      const client = createClient(sdkKey, {
        buildStep: false,
      });

      const initPromise = client.initialize();

      // Advance past the stream init timeout (3s)
      await vi.advanceTimersByTimeAsync(3_000);

      await initPromise;

      // poll() should only be called once by tryInitializePolling,
      // not a second time by startInterval's immediate poll
      expect(pollCount).toBe(1);
    });
  });
});
