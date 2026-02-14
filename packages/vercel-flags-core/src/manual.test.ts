import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { BundledSource, PollingSource, StreamSource } from './controller';
import type { StreamMessage } from './controller/stream-connection';
import {
  BundledDefinitions,
  createClient,
  type FlagsClient,
} from './index.default';
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
let clientFetchMock: Mock<typeof fetch>;
let streamFetchMock: Mock<typeof fetch>;
let stream: StreamSource;
let pollingFetchMock: Mock<typeof fetch>;
let polling: PollingSource;
let readBundledDefinitionsMock: Mock<typeof readBundledDefinitions>;
let bundled: BundledSource;
let client: FlagsClient;

describe('Manual', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();

    clientFetchMock = vi.fn();
    streamFetchMock = vi.fn();
    stream = new StreamSource({
      fetch: streamFetchMock,
      host,
      sdkKey,
    });

    pollingFetchMock = vi.fn();
    polling = new PollingSource({
      fetch: pollingFetchMock,
      host,
      sdkKey,
      polling: { intervalMs: 1000 },
    });

    readBundledDefinitionsMock = vi.fn();
    bundled = new BundledSource({
      readBundledDefinitions: readBundledDefinitionsMock,
      sdkKey,
    });

    client = createClient(sdkKey, {
      buildStep: false,
      datafile: undefined,
      fetch: clientFetchMock,
      sources: {
        stream,
        polling,
        bundled,
      },
    });
  });

  describe('creating a client', () => {
    it('should only load the bundled definitions but not stream or poll', () => {
      expect(client).toBeDefined();
      expect(streamFetchMock).not.toHaveBeenCalled();
      expect(pollingFetchMock).not.toHaveBeenCalled();
      expect(readBundledDefinitionsMock).toHaveBeenCalledWith(sdkKey);
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

      // bundled definitions must be set up before creating the client,
      // because BundledSource eagerly calls readBundledDefinitions in its constructor.
      readBundledDefinitionsMock.mockReturnValue(
        Promise.resolve({
          state: 'ok' as const,
          definitions: datafile,
        }),
      );
      bundled = new BundledSource({
        readBundledDefinitions: readBundledDefinitionsMock,
        sdkKey,
      });
      client = createClient(sdkKey, {
        buildStep: false,
        datafile: undefined,
        fetch: clientFetchMock,
        sources: { stream, polling, bundled },
      });

      // stream opens but never sends initial data
      const messageStream = createMockStream();
      streamFetchMock.mockReturnValueOnce(messageStream.response);

      // polling request starts but never resolves
      const neverResolving = new Promise<Response>(() => {});
      pollingFetchMock.mockReturnValue(neverResolving);

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
    });
  });
});
