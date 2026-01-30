import { version } from '../../package.json';
import type { BundledDefinitions, DataSourceData } from '../types';
import type { DataSource } from './interface';

type Message =
  | { type: 'datafile'; data: BundledDefinitions }
  | { type: 'ping' };

async function fetchData(
  host: string,
  sdkKey: string,
): Promise<BundledDefinitions> {
  const res = await fetch(`${host}/v1/datafile`, {
    headers: {
      Authorization: `Bearer ${sdkKey}`,
      'User-Agent': `VercelFlagsCore/${version}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch data: ${res.statusText}`);
  }

  return res.json() as Promise<BundledDefinitions>;
}

type StreamOptions = {
  host: string;
  sdkKey: string;
  signal: AbortSignal;
  onMessage: (data: BundledDefinitions) => void;
};

async function connectStream(options: StreamOptions): Promise<void> {
  const { host, sdkKey, signal, onMessage } = options;
  let retryCount = 0;

  let resolveInit: () => void;
  let rejectInit: (error: unknown) => void;
  const initPromise = new Promise<void>((resolve, reject) => {
    resolveInit = resolve;
    rejectInit = reject;
  });

  (async () => {
    let initialDataReceived = false;

    while (!signal.aborted) {
      try {
        const response = await fetch(`${host}/v1/stream`, {
          headers: {
            Authorization: `Bearer ${sdkKey}`,
            'User-Agent': `VercelFlagsCore/${version}`,
            'X-Retry-Attempt': String(retryCount),
          },
          signal,
        });

        if (!response.ok) {
          throw new Error(`stream was not ok: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('stream body was not present');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        for await (const chunk of response.body) {
          if (signal.aborted) break;

          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;

          for (const line of lines) {
            if (line === '') continue;

            const message = JSON.parse(line) as Message;

            if (message.type === 'datafile') {
              onMessage(message.data);
              if (!initialDataReceived) {
                initialDataReceived = true;
                resolveInit!();
              }
            }
          }
        }

        // Stream ended normally (server closed connection) - reconnect
        if (!signal.aborted) {
          retryCount++;
          continue;
        }
      } catch (error) {
        if (signal.aborted) {
          break;
        }
        console.error('@vercel/flags-core: Stream error', error);
        if (!initialDataReceived) {
          rejectInit!(error);
          break;
        }
        retryCount++;
      }
    }
  })();

  return initPromise;
}

/**
 * Creates a DataSource for flags.vercel.com.
 */
export function createFlagNetworkDataSource(options: {
  sdkKey: string;
}): DataSource {
  if (
    !options.sdkKey ||
    typeof options.sdkKey !== 'string' ||
    !options.sdkKey.startsWith('vf_')
  ) {
    throw new Error(
      '@vercel/flags-core: SDK key must be a string starting with "vf_"',
    );
  }

  const sdkKey = options.sdkKey;
  const host = 'https://flags.vercel.com';
  const isBuildStep =
    process.env.CI === '1' ||
    process.env.NEXT_PHASE === 'phase-production-build';

  // Instance state
  let data: DataSourceData | undefined;
  let abortController: AbortController | undefined;
  let streamPromise: Promise<void> | undefined;

  function ensureStream(): Promise<void> {
    if (streamPromise) return streamPromise;

    abortController = new AbortController();
    streamPromise = connectStream({
      host,
      sdkKey,
      signal: abortController.signal,
      onMessage: (newData) => {
        data = newData;
      },
    });

    return streamPromise;
  }

  return {
    async initialize() {
      // Don't stream during build step as the stream never closes
      if (isBuildStep) {
        if (!data) {
          data = await fetchData(host, sdkKey);
        }
        return;
      }

      await ensureStream();
    },

    async getData() {
      if (!isBuildStep) {
        await ensureStream();
      } else if (!data) {
        data = await fetchData(host, sdkKey);
      }

      if (data) return data;

      // Fallback if stream hasn't delivered yet
      return fetchData(host, sdkKey);
    },

    shutdown() {
      abortController?.abort();
      abortController = undefined;
      streamPromise = undefined;
      data = undefined;
    },

    async getMetadata() {
      if (data) {
        return { projectId: data.projectId };
      }

      const fetched = await fetchData(host, sdkKey);
      return { projectId: fetched.projectId };
    },

    async ensureFallback() {
      throw new Error('not implemented');
    },
  };
}
