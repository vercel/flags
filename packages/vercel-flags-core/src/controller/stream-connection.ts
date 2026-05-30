import { version } from '../../package.json';
import type { BundledDefinitions } from '../types';
import { sleep } from '../utils/sleep';

export type PrimedMessage = {
  type: 'primed';
  revision: number;
  projectId: string;
  environment: string;
};

export type StreamMessage =
  | { type: 'datafile'; data: BundledDefinitions }
  | PrimedMessage
  | { type: 'ping' };

const MAX_RETRY_COUNT = 15;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60_000;
const PING_TIMEOUT_MS = 90_000;

function backoff(retryCount: number): number {
  if (retryCount === 1) return 0;
  const delay = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** (retryCount - 2),
    MAX_RETRY_DELAY_MS,
  );
  return delay + Math.random() * 1000;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('stream: unauthorized (401)');
    this.name = 'UnauthorizedError';
  }
}

export type StreamCallbacks = {
  onDatafile: (data: BundledDefinitions) => void;
  onPrimed?: (message: PrimedMessage) => void;
  onDisconnect?: () => void;
};

export type StreamConfig = {
  host: string;
  sdkKey: string;
  abortController: AbortController;
  fetch?: typeof globalThis.fetch;
  /** Returns the current revision number to send as X-Revision header */
  revision?: () => number | undefined;
};

/**
 * Connects to the flags stream endpoint and handles reconnection with backoff.
 * Resolves when the first datafile message is received.
 * Rejects if the connection fails before receiving any data.
 */
export async function connectStream(
  config: StreamConfig,
  callbacks: StreamCallbacks,
): Promise<void> {
  const {
    host,
    sdkKey,
    abortController,
    fetch: fetchFn = globalThis.fetch,
  } = config;
  const { onDatafile, onPrimed, onDisconnect } = callbacks;
  let retryCount = 0;
  let lastAttemptTime = 0;

  let resolveInit: () => void;
  let rejectInit: (error: unknown) => void;
  const initPromise = new Promise<void>((resolve, reject) => {
    resolveInit = resolve;
    rejectInit = reject;
  });

  void (async () => {
    let initialDataReceived = false;

    while (!abortController.signal.aborted) {
      if (retryCount > MAX_RETRY_COUNT) {
        console.error('@vercel/flags-core: Max retry count exceeded');
        if (!initialDataReceived) {
          rejectInit!(
            new Error('stream: max retry count exceeded before receiving data'),
          );
        }
        abortController.abort();
        break;
      }

      // Per-connection abort controller for the fetch signal. Forwarded from
      // the external main abort so a hung fetch (e.g. before headers arrive)
      // can still be cancelled on shutdown.
      const fetchAbort = new AbortController();
      const onMainAbort = (): void => fetchAbort.abort();
      abortController.signal.addEventListener('abort', onMainAbort, {
        once: true,
      });

      // Tracks the in-flight body reader so the ping timeout can cancel reads
      // gracefully. Cancelling the reader breaks the read loop via
      // `{ done: true }` without aborting the fetch signal — the fetch span
      // ends cleanly. Aborting the signal would surface as AbortError on
      // instrumented fetch spans (e.g. via @vercel/otel/fetch) and get
      // reported by APM/error tracking even though this is an expected
      // reconnect path.
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let pingTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const resetPingTimeout = (): void => {
        if (pingTimeoutId !== undefined) clearTimeout(pingTimeoutId);
        if (!initialDataReceived) return;
        pingTimeoutId = setTimeout(() => {
          reader?.cancel().catch(() => {});
        }, PING_TIMEOUT_MS);
      };

      try {
        lastAttemptTime = Date.now();
        const headers: Record<string, string> = {
          Authorization: `Bearer ${sdkKey}`,
          'User-Agent': `VercelFlagsCore/${version}`,
          'X-Retry-Attempt': String(retryCount),
        };
        const vercelEnv = process.env.VERCEL_ENV;
        if (vercelEnv) {
          headers['X-Vercel-Env'] = vercelEnv;
        }
        const revision = config.revision?.();
        if (revision !== undefined) {
          headers['X-Revision'] = String(revision);
        }
        const response = await fetchFn(`${host}/v1/stream`, {
          headers,
          signal: fetchAbort.signal,
        });

        if (!response.ok) {
          if (response.status === 401) {
            if (!initialDataReceived) {
              rejectInit!(new UnauthorizedError());
            }
            abortController.abort();
            break;
          }

          throw new Error(`stream was not ok: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('stream body was not present');
        }

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        const bufferChunks: string[] = [];

        // Ensure the read loop exits promptly when the fetch signal is
        // aborted, even on zombie connections where the body doesn't observe
        // the abort. Registered after getReader() so any listeners attached
        // by the underlying source (e.g. test mocks) fire first.
        const onFetchAbort = (): void => {
          reader?.cancel().catch(() => {});
        };
        fetchAbort.signal.addEventListener('abort', onFetchAbort, {
          once: true,
        });

        try {
          while (true) {
            const { done, value: chunk } = await reader.read();
            if (done || abortController.signal.aborted) break;

            bufferChunks.push(decoder.decode(chunk, { stream: true }));
            const combined = bufferChunks.join('');
            bufferChunks.length = 0;
            const lines = combined.split('\n');
            bufferChunks.push(lines.pop()!);

            for (const line of lines) {
              if (line === '') continue;

              let message: StreamMessage;
              try {
                message = JSON.parse(line) as StreamMessage;
              } catch {
                console.warn(
                  '@vercel/flags-core: Failed to parse stream message, skipping',
                );
                continue;
              }

              if (message.type === 'datafile') {
                onDatafile(message.data);
                retryCount = 0;
                if (!initialDataReceived) {
                  initialDataReceived = true;
                  resolveInit!();
                }
                resetPingTimeout();
              }

              // Primed means the server confirmed our revision is current,
              // so no full datafile is needed. Treat it like initial data
              // for init resolution purposes.
              if (message.type === 'primed') {
                onPrimed?.(message);
                retryCount = 0;
                if (!initialDataReceived) {
                  initialDataReceived = true;
                  resolveInit!();
                }
                resetPingTimeout();
              }

              // Pings prove the connection is alive — reset retry count
              // once initial data has been received
              if (message.type === 'ping' && initialDataReceived) {
                retryCount = 0;
                resetPingTimeout();
              }
            }
          }
        } finally {
          fetchAbort.signal.removeEventListener('abort', onFetchAbort);
        }

        // Stream ended (server closed, ping timeout cancelled the reader,
        // or external abort). Either reconnect or exit the outer loop.
        clearTimeout(pingTimeoutId);
        abortController.signal.removeEventListener('abort', onMainAbort);
        if (!abortController.signal.aborted) {
          onDisconnect?.();
          retryCount++;
          const elapsed = Date.now() - lastAttemptTime;
          const minGap = Math.max(0, BASE_RETRY_DELAY_MS - elapsed);
          await sleep(Math.max(backoff(retryCount), minGap));
          continue;
        }
      } catch (error) {
        clearTimeout(pingTimeoutId);
        abortController.signal.removeEventListener('abort', onMainAbort);
        if (abortController.signal.aborted) {
          break;
        }
        console.error('@vercel/flags-core: Stream error', error);
        onDisconnect?.();
        retryCount++;
        const elapsed = Date.now() - lastAttemptTime;
        const minGap = Math.max(0, BASE_RETRY_DELAY_MS - elapsed);
        await sleep(Math.max(backoff(retryCount), minGap));
      }
    }

    // Reject the init promise if the loop exited without receiving data
    // (e.g. aborted externally before any data arrived)
    if (!initialDataReceived) {
      rejectInit!(new Error('stream: aborted before receiving data'));
    }
  })();

  return initPromise;
}
