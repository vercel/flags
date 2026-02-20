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
import { connectStream } from './stream-connection';

const HOST = 'https://flags.vercel.com';

const server = setupServer();

beforeAll(() => server.listen());
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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

describe('connectStream', () => {
  describe('connection success', () => {
    it('should resolve when first datafile message is received', async () => {
      const definitions = { projectId: 'test', definitions: {} };

      server.use(
        http.get(`${HOST}/v1/stream`, () => {
          return new HttpResponse(
            createNdjsonStream([{ type: 'datafile', data: definitions }]),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const abortController = new AbortController();
      const onMessage = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
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

      server.use(
        http.get(`${HOST}/v1/stream`, () => {
          return new HttpResponse(
            createNdjsonStream([{ type: 'datafile', data: definitions }]),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const abortController = new AbortController();
      const onMessage = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
        { onMessage },
      );

      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith(definitions);
      abortController.abort();
    });

    it('should ignore ping messages', async () => {
      const definitions = { projectId: 'test', definitions: {} };

      server.use(
        http.get(`${HOST}/v1/stream`, () => {
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

      const abortController = new AbortController();
      const onMessage = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
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

      server.use(
        http.get(`${HOST}/v1/stream`, () => {
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

      const abortController = new AbortController();
      const onMessage = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
        { onMessage },
      );

      expect(onMessage).toHaveBeenCalledWith(definitions);
      abortController.abort();
    });

    it('should skip empty lines in stream', async () => {
      const definitions = { projectId: 'test', definitions: {} };

      server.use(
        http.get(`${HOST}/v1/stream`, () => {
          return new HttpResponse(
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
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const abortController = new AbortController();
      const onMessage = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
        { onMessage },
      );

      expect(onMessage).toHaveBeenCalledTimes(1);
      abortController.abort();
    });
  });

  describe('headers', () => {
    it('should include Authorization header with Bearer token', async () => {
      let capturedHeaders: Headers | null = null;

      server.use(
        http.get(`${HOST}/v1/stream`, ({ request }) => {
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

      const abortController = new AbortController();
      await connectStream(
        { host: HOST, sdkKey: 'vf_my_key', abortController },
        { onMessage: vi.fn() },
      );

      expect(capturedHeaders!.get('Authorization')).toBe('Bearer vf_my_key');
      abortController.abort();
    });

    it('should include User-Agent header with version', async () => {
      let capturedHeaders: Headers | null = null;

      server.use(
        http.get(`${HOST}/v1/stream`, ({ request }) => {
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

      const abortController = new AbortController();
      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
        { onMessage: vi.fn() },
      );

      expect(capturedHeaders!.get('User-Agent')).toMatch(/^VercelFlagsCore\//);
      abortController.abort();
    });

    it('should include X-Retry-Attempt header starting at 0', async () => {
      let capturedHeaders: Headers | null = null;

      server.use(
        http.get(`${HOST}/v1/stream`, ({ request }) => {
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

      const abortController = new AbortController();
      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
        { onMessage: vi.fn() },
      );

      expect(capturedHeaders!.get('X-Retry-Attempt')).toBe('0');
      abortController.abort();
    });
  });

  describe('retry behavior', () => {
    it('should increment X-Retry-Attempt on reconnect after stream closes', async () => {
      const retryAttempts: string[] = [];
      let requestCount = 0;

      server.use(
        http.get(`${HOST}/v1/stream`, ({ request }) => {
          retryAttempts.push(request.headers.get('X-Retry-Attempt') ?? '');
          requestCount++;

          // First request: send data then close
          // Second request: send data and keep open
          return new HttpResponse(
            createNdjsonStream(
              [
                {
                  type: 'datafile',
                  data: { projectId: 'test', definitions: {} },
                },
              ],
              { keepOpen: requestCount >= 2 },
            ),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const abortController = new AbortController();
      const onDisconnect = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
        { onMessage: vi.fn(), onDisconnect },
      );

      // Wait for reconnection attempt
      await vi.waitFor(
        () => {
          expect(requestCount).toBeGreaterThanOrEqual(2);
        },
        { timeout: 3000 },
      );

      expect(retryAttempts[0]).toBe('0');
      expect(retryAttempts[1]).toBe('1');
      expect(onDisconnect).toHaveBeenCalled();

      abortController.abort();
    });

    it('should reset retryCount to 0 after receiving datafile', async () => {
      const retryAttempts: string[] = [];
      let requestCount = 0;

      server.use(
        http.get(`${HOST}/v1/stream`, ({ request }) => {
          retryAttempts.push(request.headers.get('X-Retry-Attempt') ?? '');
          requestCount++;

          // Close stream after each datafile to trigger reconnect
          return new HttpResponse(
            createNdjsonStream(
              [
                {
                  type: 'datafile',
                  data: { projectId: 'test', definitions: {} },
                },
              ],
              { keepOpen: requestCount >= 3 },
            ),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const abortController = new AbortController();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
        { onMessage: vi.fn() },
      );

      // Wait for multiple reconnections
      await vi.waitFor(
        () => {
          expect(requestCount).toBeGreaterThanOrEqual(3);
        },
        { timeout: 5000 },
      );

      // Each reconnect after successful datafile should reset to 0, then increment by 1
      // Request 1: retry=0, gets datafile, resets to 0, stream closes, increments to 1
      // Request 2: retry=1, gets datafile, resets to 0, stream closes, increments to 1
      // Request 3: retry=1, gets datafile, resets to 0
      expect(retryAttempts[0]).toBe('0');
      expect(retryAttempts[1]).toBe('1');
      expect(retryAttempts[2]).toBe('1');

      abortController.abort();
    });

    it('should enforce minimum delay between reconnection attempts when retryCount resets', async () => {
      vi.useFakeTimers();

      const retryAttempts: string[] = [];
      let requestCount = 0;

      server.use(
        http.get(`${HOST}/v1/stream`, ({ request }) => {
          retryAttempts.push(request.headers.get('X-Retry-Attempt') ?? '');
          requestCount++;

          // Each request: send datafile (resets retryCount to 0) then close
          // On the 4th request, keep open to stop the loop
          return new HttpResponse(
            createNdjsonStream(
              [
                {
                  type: 'datafile',
                  data: { projectId: 'test', definitions: {} },
                },
              ],
              { keepOpen: requestCount >= 4 },
            ),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const abortController = new AbortController();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
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
      vi.useRealTimers();
    });

    it('should call onDisconnect when stream ends normally', async () => {
      let requestCount = 0;

      server.use(
        http.get(`${HOST}/v1/stream`, () => {
          requestCount++;
          return new HttpResponse(
            createNdjsonStream(
              [
                {
                  type: 'datafile',
                  data: { projectId: 'test', definitions: {} },
                },
              ],
              { keepOpen: requestCount >= 2 },
            ),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const abortController = new AbortController();
      const onDisconnect = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
        { onMessage: vi.fn(), onDisconnect },
      );

      await vi.waitFor(() => {
        expect(onDisconnect).toHaveBeenCalled();
      });

      abortController.abort();
    });
  });

  describe('failure cases', () => {
    // Note: 401 response behavior is tested through FlagNetworkDataSource
    // which handles the timeout fallback. The stream-connection aborts on 401
    // but the promise resolution is handled by the timeout mechanism in
    // FlagNetworkDataSource.getDataWithStreamTimeout().

    it('should retry on error before first datafile and reject when aborted', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let requestCount = 0;

      server.use(
        http.get(`${HOST}/v1/stream`, () => {
          requestCount++;
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const abortController = new AbortController();

      const promise = connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
        { onMessage: vi.fn() },
      );

      // Wait for at least one retry attempt (first retry has 0ms backoff)
      await vi.waitFor(
        () => {
          expect(requestCount).toBeGreaterThanOrEqual(2);
        },
        { timeout: 3000 },
      );

      // Abort to stop retries
      abortController.abort();

      // The init promise should reject since no data was received
      await expect(promise).rejects.toThrow(
        'stream: aborted before receiving data',
      );

      errorSpy.mockRestore();
    });

    it('should retry if response has no body and reject when aborted', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let requestCount = 0;

      server.use(
        http.get(`${HOST}/v1/stream`, () => {
          requestCount++;
          // Return a response without a body
          return new HttpResponse(null, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          });
        }),
      );

      const abortController = new AbortController();

      const promise = connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
        { onMessage: vi.fn() },
      );

      // Wait for at least one retry attempt (first retry has 0ms backoff)
      await vi.waitFor(
        () => {
          expect(requestCount).toBeGreaterThanOrEqual(2);
        },
        { timeout: 3000 },
      );

      // Abort to stop retries
      abortController.abort();

      // The init promise should reject since no data was received
      await expect(promise).rejects.toThrow(
        'stream: aborted before receiving data',
      );

      errorSpy.mockRestore();
    });

    it('should call onDisconnect on error after initial data received', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let requestCount = 0;

      server.use(
        http.get(`${HOST}/v1/stream`, () => {
          requestCount++;
          if (requestCount === 1) {
            // First request succeeds
            return new HttpResponse(
              createNdjsonStream([
                {
                  type: 'datafile',
                  data: { projectId: 'test', definitions: {} },
                },
              ]),
              { headers: { 'Content-Type': 'application/x-ndjson' } },
            );
          }
          // Subsequent requests fail
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const abortController = new AbortController();
      const onDisconnect = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
        { onMessage: vi.fn(), onDisconnect },
      );

      // Wait for disconnect to be called (from first stream close and error)
      await vi.waitFor(
        () => {
          expect(onDisconnect).toHaveBeenCalled();
        },
        { timeout: 3000 },
      );

      abortController.abort();
      errorSpy.mockRestore();
    });

    // Note: Testing MAX_RETRY_COUNT exceeded is skipped because the backoff delays
    // make the test too slow. The behavior is:
    // - After 10 retries without receiving data, the connection aborts
    // - console.error('@vercel/flags-core: Max retry count exceeded') is logged
    // This is tested indirectly through FlagNetworkDataSource integration tests.

    it('should stop when abortController is aborted externally', async () => {
      server.use(
        http.get(`${HOST}/v1/stream`, ({ request }) => {
          return new HttpResponse(
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
                request.signal.addEventListener('abort', () => {
                  controller.close();
                });
              },
            }),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const abortController = new AbortController();
      const onMessage = vi.fn();

      await connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
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

      server.use(
        http.get(`${HOST}/v1/stream`, () => {
          return new HttpResponse(
            createNdjsonStream([
              { type: 'datafile', data: data1 },
              { type: 'datafile', data: data2 },
            ]),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }),
      );

      const abortController = new AbortController();
      const onMessage = vi.fn();

      const promise = connectStream(
        { host: HOST, sdkKey: 'vf_test', abortController },
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
