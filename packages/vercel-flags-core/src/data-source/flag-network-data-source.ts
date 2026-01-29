import { version } from '../../package.json';
import type { BundledDefinitions, DataSourceData } from '../types';
import type { DataSource, DataSourceMetadata } from './interface';

type Message =
  | { type: 'datafile'; data: BundledDefinitions }
  | { type: 'ping' };

// Module-level store for shared stream connections
type StoreEntry = {
  data: DataSourceData | undefined;
  abortController: AbortController | undefined;
  streamStarted: boolean;
  initPromise: Promise<void> | undefined;
  retryCount: number;
};

const store = new Map<string, StoreEntry>();

function getOrCreateEntry(sdkKey: string): StoreEntry {
  if (!store.has(sdkKey)) {
    store.set(sdkKey, {
      data: undefined,
      abortController: undefined,
      streamStarted: false,
      initPromise: undefined,
      retryCount: 0,
    });
  }
  return store.get(sdkKey)!;
}

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

function ensureStream(host: string, sdkKey: string): Promise<void> {
  const entry = getOrCreateEntry(sdkKey);

  if (entry.initPromise) {
    return entry.initPromise;
  }

  let resolveInit: () => void;
  let rejectInit: (error: unknown) => void;
  entry.initPromise = new Promise<void>((resolve, reject) => {
    resolveInit = resolve;
    rejectInit = reject;
  });

  entry.streamStarted = true;

  (async () => {
    let initialDataReceived = false;

    while (entry.streamStarted) {
      try {
        // Create a new AbortController for each connection attempt
        entry.abortController = new AbortController();

        const response = await fetch(`${host}/v1/stream`, {
          headers: {
            Authorization: `Bearer ${sdkKey}`,
            'User-Agent': `VercelFlagsCore/${version}`,
            'X-Retry-Attempt': String(entry.retryCount),
          },
          signal: entry.abortController.signal,
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
          if (!entry.streamStarted) break;

          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop()!;

          for (const line of lines) {
            if (line === '') continue;

            const message = JSON.parse(line) as Message;

            if (message.type === 'datafile') {
              entry.data = message.data;
              if (!initialDataReceived) {
                initialDataReceived = true;
                resolveInit!();
              }
            }
          }
        }

        // Stream ended normally (server closed connection) - reconnect
        if (entry.streamStarted) {
          entry.retryCount++;
          continue;
        }
      } catch (error) {
        if (entry.abortController?.signal.aborted) {
          break;
        }
        console.error('@vercel/flags-core: Stream error', error);
        if (!initialDataReceived) {
          rejectInit!(error);
          break;
        }
        entry.retryCount++;
      }
    }
  })();

  return entry.initPromise;
}

// Reads from shared store, falls back to fetch
async function getDataImpl(
  host: string,
  sdkKey: string,
): Promise<DataSourceData> {
  const entry = store.get(sdkKey);
  if (entry?.data) {
    return entry.data;
  }

  // Fallback if stream hasn't delivered yet
  return fetchData(host, sdkKey);
}

// Gets metadata from store or fetches
async function getMetadataImpl(
  host: string,
  sdkKey: string,
): Promise<DataSourceMetadata> {
  const entry = store.get(sdkKey);
  if (entry?.data) {
    return { projectId: entry.data.projectId };
  }

  const data = await fetchData(host, sdkKey);
  return { projectId: data.projectId };
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

  return {
    async initialize() {
      // Don't stream during build step as the stream never closes
      if (isBuildStep) {
        const entry = getOrCreateEntry(sdkKey);
        if (!entry.data) {
          entry.data = await fetchData(host, sdkKey);
        }
        return;
      }

      await ensureStream(host, sdkKey);
    },

    async getData() {
      // Ensure stream is started and has initial data
      if (!isBuildStep) {
        await ensureStream(host, sdkKey);
      } else {
        const entry = getOrCreateEntry(sdkKey);
        if (!entry.data) {
          entry.data = await fetchData(host, sdkKey);
        }
      }
      return getDataImpl(host, sdkKey);
    },

    shutdown() {
      const entry = store.get(sdkKey);
      if (entry) {
        entry.streamStarted = false;
        entry.abortController?.abort();
        store.delete(sdkKey);
      }
    },

    async getMetadata() {
      return getMetadataImpl(host, sdkKey);
    },

    async ensureFallback() {
      throw new Error('not implemented');
    },
  };
}
