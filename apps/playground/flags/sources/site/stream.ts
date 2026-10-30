import { setTimeout as delay } from 'node:timers/promises';
import type { DatafileInput } from '@vercel/flags-core';
import { getVercelOidcToken } from '@vercel/oidc';

interface StreamOptions {
  signal: AbortSignal;
  fetch?: typeof globalThis.fetch;
  getToken?: () => Promise<string>;
}

class AuthenticationError extends Error {}

/** The Vercel endpoint sends NDJSON, not server-sent events. */
export async function* streamDatafiles({
  signal,
  fetch = globalThis.fetch,
  getToken = getVercelOidcToken,
}: StreamOptions): AsyncGenerator<DatafileInput> {
  let receivedDatafile = false;
  let retryCount = 0;
  let previous: DatafileInput | undefined;

  while (!signal.aborted) {
    const connection = new AbortController();
    const abort = () => connection.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    let timeout: ReturnType<typeof setTimeout>;
    const resetTimeout = (milliseconds: number) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        connection.abort(new Error('Flags catalog stream timed out.'));
      }, milliseconds);
    };
    resetTimeout(15_000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancelReader = () => {
      void reader?.cancel().catch(() => {});
    };
    connection.signal.addEventListener('abort', cancelReader, { once: true });

    try {
      // Resolve a fresh credential on every reconnect.
      const token = await getToken();
      connection.signal.throwIfAborted();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (process.env.VERCEL_ENV) {
        headers['X-Vercel-Env'] = process.env.VERCEL_ENV;
      }
      // No revision header: every connection starts with a complete snapshot.
      const response = await fetch('https://flags.vercel.com/v1/stream', {
        headers,
        signal: connection.signal,
        cache: 'no-store',
      });
      if (response.status === 401 || response.status === 403) {
        throw new AuthenticationError(
          `Flags catalog stream authentication failed (${response.status}). Run vercel env pull .env.local, then restart the watcher.`,
        );
      }
      if (!response.ok || !response.body) {
        throw new Error(`Flags catalog stream failed (${response.status}).`);
      }
      reader = response.body.getReader();
      connection.signal.throwIfAborted();
      const decoder = new TextDecoder();
      let buffer = '';
      let connected = false;
      while (!connection.signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        buffer += decoder.decode(chunk.value, { stream: true });
        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) {
            const message = JSON.parse(line);
            if (message.type === 'datafile') {
              const datafile = message.data as DatafileInput;
              connected = true;
              receivedDatafile = true;
              retryCount = 0;
              resetTimeout(90_000);
              const sameSource =
                previous?.projectId === datafile.projectId &&
                previous?.environment === datafile.environment;
              const olderOrEqual =
                sameSource &&
                typeof previous?.revision === 'number' &&
                typeof datafile.revision === 'number' &&
                datafile.revision <= previous.revision;
              if (!olderOrEqual) {
                previous = datafile;
                yield datafile;
              }
            } else if (message.type === 'ping' && connected) {
              retryCount = 0;
              resetTimeout(90_000);
            }
          }
          newline = buffer.indexOf('\n');
        }
      }
      if (!signal.aborted) {
        throw new Error('Flags catalog stream disconnected.');
      }
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      if (!receivedDatafile || error instanceof AuthenticationError) {
        throw error;
      }
      console.warn('[flags] Catalog stream disconnected; reconnecting.');
    } finally {
      clearTimeout(timeout!);
      connection.abort();
      await reader?.cancel().catch(() => {});
      reader?.releaseLock();
      signal.removeEventListener('abort', abort);
    }

    if (!signal.aborted) {
      const milliseconds = Math.min(1000 * 2 ** retryCount, 30_000);
      retryCount += 1;
      await delay(milliseconds, undefined, { signal }).catch(
        (error: unknown) => {
          if (!signal.aborted) {
            throw error;
          }
        },
      );
    }
  }
}
