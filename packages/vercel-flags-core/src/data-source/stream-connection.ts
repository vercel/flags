import { version } from '../../package.json';
import type { BundledDefinitions } from '../types';
import { sleep } from '../utils/sleep';

export type StreamMessage =
  | { type: 'datafile'; data: BundledDefinitions }
  | { type: 'ping' };

const MAX_RETRY_COUNT = 15;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60_000;

function backoff(retryCount: number): number {
  if (retryCount === 1) return 0;
  const delay = Math.min(BASE_DELAY_MS * 2 ** (retryCount - 2), MAX_DELAY_MS);
  return delay + Math.random() * 1000;
}

export type StreamCallbacks = {
  onMessage: (data: BundledDefinitions) => void;
  onDisconnect?: () => void;
};

export type StreamConfig = {
  host: string;
  sdkKey: string;
  abortController: AbortController;
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
  const { host, sdkKey, abortController } = config;
  const { onMessage, onDisconnect } = callbacks;
  let retryCount = 0;

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
        abortController.abort();
        break;
      }

      try {
        const response = await fetch(`${host}/v1/stream`, {
          headers: {
            Authorization: `Bearer ${sdkKey}`,
            'User-Agent': `VercelFlagsCore/${version}`,
            'X-Retry-Attempt': String(retryCount),
          },
          signal: abortController.signal,
        });

        if (!response.ok) {
          if (response.status === 401) {
            abortController.abort();
          }

          throw new Error(`stream was not ok: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('stream body was not present');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        for await (const chunk of response.body) {
          if (abortController.signal.aborted) break;

          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;

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
              onMessage(message.data);
              retryCount = 0;
              if (!initialDataReceived) {
                initialDataReceived = true;
                resolveInit!();
              }
            }
          }
        }

        // Stream ended normally (server closed connection) - reconnect
        if (!abortController.signal.aborted) {
          onDisconnect?.();
          retryCount++;
          await sleep(backoff(retryCount));
          continue;
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          console.error('@vercel/flags-core: Stream aborted', error);
          break;
        }
        console.error('@vercel/flags-core: Stream error', error);
        onDisconnect?.();
        if (!initialDataReceived) {
          rejectInit!(error);
          break;
        }
        retryCount++;
        await sleep(backoff(retryCount));
      }
    }
  })();

  return initPromise;
}
