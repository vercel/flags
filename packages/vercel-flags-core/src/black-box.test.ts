// extend client with concept of per-request data so we can set overrides?
// extend client with concept of request transaction so a single request is guaranteed consistent flag data?
//   could be unexpected if used in a workflow or stream or whatever

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import { BundledSource, PollingSource, StreamSource } from './controller';
import type { StreamMessage } from './controller/stream-connection';
import { type BundledDefinitions, createClient } from './index.default';
import type { BundledDefinitionsResult } from './types';
import type { readBundledDefinitions } from './utils/read-bundled-definitions';

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
      controller.enqueue(encoder.encode(JSON.stringify(message) + '\n'));
    },
    close() {
      controller.close();
    },
  };
}

const host = 'https://flags.vercel.com';
const sdkKey = 'vf_fake';

/**
 * Creates a test client with isolated mocks.
 * Each test can configure bundled definitions via the optional parameter,
 * avoiding side effects from eager BundledSource construction.
 */
function createTestClient(options?: {
  bundledResult?: BundledDefinitionsResult;
}) {
  const clientFetchMock: Mock<typeof fetch> = vi.fn();
  const streamFetchMock: Mock<typeof fetch> = vi.fn();
  const stream = new StreamSource({
    fetch: streamFetchMock,
    host,
    sdkKey,
  });

  const pollingFetchMock: Mock<typeof fetch> = vi.fn();
  const polling = new PollingSource({
    fetch: pollingFetchMock,
    host,
    sdkKey,
    polling: { intervalMs: 1000 },
  });

  const readBundledDefinitionsMock: Mock<typeof readBundledDefinitions> =
    vi.fn();
  if (options?.bundledResult) {
    readBundledDefinitionsMock.mockReturnValue(
      Promise.resolve(options.bundledResult),
    );
  }
  const bundled = new BundledSource({
    readBundledDefinitions: readBundledDefinitionsMock,
    sdkKey,
  });

  const client = createClient(sdkKey, {
    buildStep: false,
    datafile: undefined,
    fetch: clientFetchMock,
    sources: {
      stream,
      polling,
      bundled,
    },
  });

  return {
    client,
    clientFetchMock,
    streamFetchMock,
    pollingFetchMock,
    readBundledDefinitionsMock,
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
      const {
        client,
        streamFetchMock,
        pollingFetchMock,
        readBundledDefinitionsMock,
      } = createTestClient();

      expect(client).toBeDefined();
      expect(streamFetchMock).not.toHaveBeenCalled();
      expect(pollingFetchMock).not.toHaveBeenCalled();
      expect(readBundledDefinitionsMock).toHaveBeenCalledWith(sdkKey);
    });
  });

  describe('initializing the client', () => {
    it('should init from the stream', async () => {
      const { client, streamFetchMock } = createTestClient();

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
      streamFetchMock.mockReturnValueOnce(messageStream.response);
      messageStream.push({ type: 'datafile', data: datafile });

      await client.initialize();

      expect(streamFetchMock).toHaveBeenCalledTimes(1);
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

      const { client, streamFetchMock, pollingFetchMock } = createTestClient({
        bundledResult: { state: 'ok', definitions: datafile },
      });

      // stream opens but never sends initial data
      const messageStream = createMockStream();
      streamFetchMock.mockReturnValueOnce(messageStream.response);

      // polling request starts but never resolves
      pollingFetchMock.mockImplementation(
        () => new Promise<Response>(() => {}),
      );

      const initPromise = client.initialize();

      // Advance past the stream init timeout (3s) and polling init timeout (3s)
      await vi.advanceTimersByTimeAsync(1_000);
      expect(pollingFetchMock).toHaveBeenCalledTimes(0);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(pollingFetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(3_000);

      // wait for init to resolve
      await expect(initPromise).resolves.toBeUndefined();

      expect(streamFetchMock).toHaveBeenCalledTimes(1);
      expect(pollingFetchMock).toHaveBeenCalledTimes(1);
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

      const { client, streamFetchMock, pollingFetchMock } = createTestClient();

      // stream opens but never sends initial data
      const messageStream = createMockStream();
      streamFetchMock.mockReturnValueOnce(messageStream.response);

      // polling returns a valid datafile
      pollingFetchMock.mockImplementation(() =>
        Promise.resolve(Response.json(datafile)),
      );

      const initPromise = client.initialize();

      // Advance past the stream init timeout (3s)
      await vi.advanceTimersByTimeAsync(3_000);

      await initPromise;

      // poll() should only be called once by tryInitializePolling,
      // not a second time by startInterval's immediate poll
      expect(pollingFetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
