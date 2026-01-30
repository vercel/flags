import { version } from '../../package.json';
import type {
  BundledDefinitions,
  DataSource,
  DataSourceData,
  DataSourceMetadata,
} from '../types';

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
 * A DataSource for flags.vercel.com.
 */
export class FlagNetworkDataSource implements DataSource {
  private sdkKey: string;
  private host = 'https://flags.vercel.com';
  private isBuildStep: boolean;
  private data: DataSourceData | undefined;
  private abortController: AbortController | undefined;
  private streamPromise: Promise<void> | undefined;

  constructor(options: { sdkKey: string }) {
    if (
      !options.sdkKey ||
      typeof options.sdkKey !== 'string' ||
      !options.sdkKey.startsWith('vf_')
    ) {
      throw new Error(
        '@vercel/flags-core: SDK key must be a string starting with "vf_"',
      );
    }

    this.sdkKey = options.sdkKey;
    this.isBuildStep =
      process.env.CI === '1' ||
      process.env.NEXT_PHASE === 'phase-production-build';
  }

  private ensureStream(): Promise<void> {
    if (this.streamPromise) return this.streamPromise;

    this.abortController = new AbortController();
    this.streamPromise = connectStream({
      host: this.host,
      sdkKey: this.sdkKey,
      signal: this.abortController.signal,
      onMessage: (newData) => {
        this.data = newData;
      },
    });

    return this.streamPromise;
  }

  async initialize(): Promise<void> {
    // Don't stream during build step as the stream never closes
    if (this.isBuildStep) {
      if (!this.data) {
        this.data = await fetchData(this.host, this.sdkKey);
      }
      return;
    }

    await this.ensureStream();
  }

  async getData(): Promise<DataSourceData> {
    if (!this.isBuildStep) {
      await this.ensureStream();
    } else if (!this.data) {
      this.data = await fetchData(this.host, this.sdkKey);
    }

    if (this.data) return this.data;

    // Fallback if stream hasn't delivered yet
    return fetchData(this.host, this.sdkKey);
  }

  shutdown(): void {
    this.abortController?.abort();
    this.abortController = undefined;
    this.streamPromise = undefined;
    this.data = undefined;
  }

  async getMetadata(): Promise<DataSourceMetadata> {
    if (this.data) {
      return { projectId: this.data.projectId };
    }

    const fetched = await fetchData(this.host, this.sdkKey);
    return { projectId: fetched.projectId };
  }

  async ensureFallback(): Promise<void> {
    throw new Error('not implemented');
  }
}
