import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectStream } from './stream-connection';

const HOST = 'https://flags.vercel.com';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
});

function createNdjsonStream(
  messages: object[],
  options?: { delayMs?: number; keepOpen?: boolean },
): ReadableStream {
  const { delayMs = 0, keepOpen = false } = options ?? {};
  return new ReadableStream({
    async start(controller) {
      for (const message of messages) {
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        controller.enqueue(
          new TextEncoder().encode(`${JSON.stringify(message)}\n`),
        );
      }
      if (!keepOpen) {
        controller.close();
      }
    },
  });
}

function streamResponse(
  body: ReadableStream | null,
  status = 200,
): Promise<Response> {
  return Promise.resolve(
    new Response(body, {
      status,
      headers: { 'Content-Type': 'application/x-ndjson' },
    }),
  );
}

function ndjsonResponse(messages: object[], options?: { keepOpen?: boolean }) {
  return streamResponse(createNdjsonStream(messages, options));
}

const datafileMsg = (definitions = {}) => ({
  type: 'datafile' as const,
  data: { projectId: 'test', definitions },
});

describe('connectStream', () => {
  describe('connection success', () => {
    it('should resolve when first datafile message is received', async () => {
      const definitions = { projectId: 'test', definitions: {} };

      fetchMock.mockImplementation(() =>
        ndjsonResponse([{ type: 'datafile', data: definitions }]),
      );

      const abortController = new AbortController();
      const onMessage = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage },
      );

      expect(onMessage).toHaveBeenCalledWith(definitions);
      abortController.abort();
    });

    it('should call onMessage callback with parsed data', async () => {
      const definitions = {
        projectId: 'test',
        definitions: { flag: { variants: [true] } },
      };

      fetchMock.mockImplementation(() =>
        ndjsonResponse([{ type: 'datafile', data: definitions }]),
      );

      const abortController = new AbortController();
      const onMessage = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage },
      );

      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith(definitions);
      abortController.abort();
    });

    it('should ignore ping messages', async () => {
      const definitions = { projectId: 'test', definitions: {} };

      fetchMock.mockImplementation(() =>
        ndjsonResponse([
          { type: 'ping' },
          { type: 'datafile', data: definitions },
          { type: 'ping' },
        ]),
      );

      const abortController = new AbortController();
      const onMessage = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage },
      );

      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith(definitions);
      abortController.abort();
    });

    it('should handle NDJSON messages split across chunks', async () => {
      const definitions = { projectId: 'test', definitions: { flag: true } };
      const fullMessage = JSON.stringify({
        type: 'datafile',
        data: definitions,
      });
      const part1 = fullMessage.slice(0, 20);
      const part2 = `${fullMessage.slice(20)}\n`;

      fetchMock.mockImplementation(() =>
        streamResponse(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(new TextEncoder().encode(part1));
              await new Promise((r) => setTimeout(r, 10));
              controller.enqueue(new TextEncoder().encode(part2));
              controller.close();
            },
          }),
        ),
      );

      const abortController = new AbortController();
      const onMessage = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage },
      );

      expect(onMessage).toHaveBeenCalledWith(definitions);
      abortController.abort();
    });

    it('should skip empty lines in stream', async () => {
      const definitions = { projectId: 'test', definitions: {} };

      fetchMock.mockImplementation(() =>
        streamResponse(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('\n\n'));
              controller.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({ type: 'datafile', data: definitions }) +
                    '\n',
                ),
              );
              controller.enqueue(new TextEncoder().encode('\n'));
              controller.close();
            },
          }),
        ),
      );

      const abortController = new AbortController();
      const onMessage = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage },
      );

      expect(onMessage).toHaveBeenCalledTimes(1);
      abortController.abort();
    });
  });

  describe('headers', () => {
    beforeEach(() => {
      fetchMock.mockImplementation(() => ndjsonResponse([datafileMsg()]));
    });

    it('should include Authorization header with Bearer token', async () => {
      const abortController = new AbortController();
      await connectStream(
        { host: HOST, sdkKey: 'vf_my_key', abortController, fetch: fetchMock },
        { onMessage: vi.fn() },
      );

      const headers = fetchMock.mock.calls[0]![1]!.headers as Record<
        string,
        string
      >;
      expect(headers.Authorization).toBe('Bearer vf_my_key');
      abortController.abort();
    });

    it('should include User-Agent header with version', async () => {
      const abortController = new AbortController();
      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage: vi.fn() },
      );

      const headers = fetchMock.mock.calls[0]![1]!.headers as Record<
        string,
        string
      >;
      expect(headers['User-Agent']).toMatch(/^VercelFlagsCore\//);
      abortController.abort();
    });

    it('should include X-Retry-Attempt header starting at 0', async () => {
      const abortController = new AbortController();
      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage: vi.fn() },
      );

      const headers = fetchMock.mock.calls[0]![1]!.headers as Record<
        string,
        string
      >;
      expect(headers['X-Retry-Attempt']).toBe('0');
      abortController.abort();
    });
  });

  describe('retry behavior', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('should increment X-Retry-Attempt on reconnect after stream closes', async () => {
      let requestCount = 0;

      fetchMock.mockImplementation(() => {
        requestCount++;
        return ndjsonResponse([datafileMsg()], { keepOpen: requestCount >= 2 });
      });

      const abortController = new AbortController();
      const onDisconnect = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage: vi.fn(), onDisconnect },
      );

      // Advance past the reconnection backoff delay
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(0);

      expect(requestCount).toBeGreaterThanOrEqual(2);
      const h0 = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
      const h1 = fetchMock.mock.calls[1]![1]!.headers as Record<string, string>;
      expect(h0['X-Retry-Attempt']).toBe('0');
      expect(h1['X-Retry-Attempt']).toBe('1');
      expect(onDisconnect).toHaveBeenCalled();

      abortController.abort();
    });

    it('should reset retryCount to 0 after receiving datafile', async () => {
      let requestCount = 0;

      fetchMock.mockImplementation(() => {
        requestCount++;
        return ndjsonResponse([datafileMsg()], { keepOpen: requestCount >= 3 });
      });

      const abortController = new AbortController();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage: vi.fn() },
      );

      // Advance past first reconnection backoff
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(0);

      // Advance past second reconnection backoff
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(0);

      expect(requestCount).toBeGreaterThanOrEqual(3);

      // Each reconnect after successful datafile should reset to 0, then increment by 1
      const h0 = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
      const h1 = fetchMock.mock.calls[1]![1]!.headers as Record<string, string>;
      const h2 = fetchMock.mock.calls[2]![1]!.headers as Record<string, string>;
      expect(h0['X-Retry-Attempt']).toBe('0');
      expect(h1['X-Retry-Attempt']).toBe('1');
      expect(h2['X-Retry-Attempt']).toBe('1');

      abortController.abort();
    });

    it('should enforce minimum delay between reconnection attempts when retryCount resets', async () => {
      let requestCount = 0;

      fetchMock.mockImplementation(() => {
        requestCount++;
        return ndjsonResponse([datafileMsg()], { keepOpen: requestCount >= 4 });
      });

      const abortController = new AbortController();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage: vi.fn() },
      );

      // After the first stream closes, retryCount was reset to 0 then
      // incremented to 1 — backoff(1) = 0 but minimum gap is 1s.
      // Advance 999ms — not enough for the minimum gap
      await vi.advanceTimersByTimeAsync(999);
      expect(requestCount).toBe(1);

      // Advance past the 1s minimum gap
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(requestCount).toBe(2);

      // Same pattern for the next reconnection
      await vi.advanceTimersByTimeAsync(999);
      expect(requestCount).toBe(2);

      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(requestCount).toBe(3);

      abortController.abort();
    });

    it('should call onDisconnect when stream ends normally', async () => {
      let requestCount = 0;

      fetchMock.mockImplementation(() => {
        requestCount++;
        return ndjsonResponse([datafileMsg()], { keepOpen: requestCount >= 2 });
      });

      const abortController = new AbortController();
      const onDisconnect = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage: vi.fn(), onDisconnect },
      );

      // Advance past the reconnection backoff delay
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(0);

      expect(onDisconnect).toHaveBeenCalled();

      abortController.abort();
    });
  });

  describe('failure cases', () => {
    // Note: 401 response behavior is tested through FlagNetworkDataSource
    // which handles the timeout fallback. The stream-connection aborts on 401
    // but the promise resolution is handled by the timeout mechanism in
    // FlagNetworkDataSource.getDataWithStreamTimeout().

    it('should retry on error before first datafile and reject when aborted', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let requestCount = 0;

      fetchMock.mockImplementation(() => {
        requestCount++;
        return Promise.resolve(new Response(null, { status: 500 }));
      });

      const abortController = new AbortController();

      const promise = connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage: vi.fn() },
      );

      // First request fires immediately, first retry has 0ms backoff
      await vi.advanceTimersByTimeAsync(0);
      // Advance past the second retry backoff (1s base + jitter)
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(0);

      expect(requestCount).toBeGreaterThanOrEqual(2);

      // Abort to stop retries
      abortController.abort();

      // The init promise should reject since no data was received
      await expect(promise).rejects.toThrow(
        'stream: aborted before receiving data',
      );

      errorSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should retry if response has no body and reject when aborted', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let requestCount = 0;

      fetchMock.mockImplementation(() => {
        requestCount++;
        return Promise.resolve(
          new Response(null, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          }),
        );
      });

      const abortController = new AbortController();

      const promise = connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage: vi.fn() },
      );

      // First request fires immediately, first retry has 0ms backoff
      await vi.advanceTimersByTimeAsync(0);
      // Advance past the second retry backoff (1s base + jitter)
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(0);

      expect(requestCount).toBeGreaterThanOrEqual(2);

      // Abort to stop retries
      abortController.abort();

      // The init promise should reject since no data was received
      await expect(promise).rejects.toThrow(
        'stream: aborted before receiving data',
      );

      errorSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should call onDisconnect on error after initial data received', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let requestCount = 0;

      fetchMock.mockImplementation(() => {
        requestCount++;
        if (requestCount === 1) {
          return ndjsonResponse([datafileMsg()]);
        }
        return Promise.resolve(new Response(null, { status: 500 }));
      });

      const abortController = new AbortController();
      const onDisconnect = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage: vi.fn(), onDisconnect },
      );

      // Advance past the reconnection backoff delay
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(0);

      expect(onDisconnect).toHaveBeenCalled();

      abortController.abort();
      errorSpy.mockRestore();
      vi.useRealTimers();
    });

    // Note: Testing MAX_RETRY_COUNT exceeded is skipped because the backoff delays
    // make the test too slow. The behavior is:
    // - After 10 retries without receiving data, the connection aborts
    // - console.error('@vercel/flags-core: Max retry count exceeded') is logged
    // This is tested indirectly through FlagNetworkDataSource integration tests.

    it('should stop when abortController is aborted externally', async () => {
      fetchMock.mockImplementation((_input, init) =>
        streamResponse(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `${JSON.stringify({
                    type: 'datafile',
                    data: { projectId: 'test', definitions: {} },
                  })}\n`,
                ),
              );
              // Keep stream open
              init?.signal?.addEventListener('abort', () => {
                controller.close();
              });
            },
          }),
        ),
      );

      const abortController = new AbortController();
      const onMessage = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage },
      );

      expect(onMessage).toHaveBeenCalledTimes(1);

      // Abort externally
      abortController.abort();

      // Should stop without errors
      expect(abortController.signal.aborted).toBe(true);
    });
  });

  describe('multiple datafile messages', () => {
    it('should call onMessage for each datafile but only resolve once', async () => {
      const data1 = { projectId: 'test', definitions: { v: 1 } };
      const data2 = { projectId: 'test', definitions: { v: 2 } };

      fetchMock.mockImplementation(() =>
        ndjsonResponse([
          { type: 'datafile', data: data1 },
          { type: 'datafile', data: data2 },
        ]),
      );

      const abortController = new AbortController();
      const onMessage = vi.fn();

      const promise = connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController, fetch: fetchMock },
        { onMessage },
      );

      // Should resolve (not hang waiting for more data)
      await promise;

      // Wait for all messages to be processed
      await vi.waitFor(() => {
        expect(onMessage).toHaveBeenCalledTimes(2);
      });

      expect(onMessage).toHaveBeenNthCalledWith(1, data1);
      expect(onMessage).toHaveBeenNthCalledWith(2, data2);

      abortController.abort();
    });
  });
});
