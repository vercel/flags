import { version } from '../../package.json';
import type {
  BundledDefinitions,
  BundledDefinitionsResult,
  DataSource,
  DataSourceData,
  DataSourceMetadata,
} from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import { type TrackReadOptions, UsageTracker } from '../utils/usage-tracker';

type Message =
  | { type: 'datafile'; data: BundledDefinitions }
  | { type: 'ping' };

const MAX_RETRY_COUNT = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(retryCount: number): number {
  if (retryCount === 1) return 0;
  const delay = Math.min(BASE_DELAY_MS * 2 ** (retryCount - 2), MAX_DELAY_MS);
  return delay + Math.random() * 1000;
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

type StreamOptions = {
  host: string;
  sdkKey: string;
  abortController: AbortController;
  onMessage: (data: BundledDefinitions) => void;
  onDisconnect?: () => void;
};

async function connectStream(options: StreamOptions): Promise<void> {
  const { host, sdkKey, abortController, onMessage, onDisconnect } = options;
  let retryCount = 0;

  let resolveInit: () => void;
  let rejectInit: (error: unknown) => void;
  const initPromise = new Promise<void>((resolve, reject) => {
    resolveInit = resolve;
    rejectInit = reject;
  });

  (async () => {
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

            const message = JSON.parse(line) as Message;

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
  private streamTimeoutMs: number;
  private usageTracker: UsageTracker;
  private isFirstGetData: boolean = true;
  private isStreamConnected: boolean = false;
  private hasWarnedAboutStaleData: boolean = false;
  private _breakLoop: boolean = false;

  // Public for testing - allows tests to mock bundled definitions
  public bundledDefinitionsPromise:
    | Promise<BundledDefinitionsResult>
    | undefined;

  // For testing purposes
  get definitions(): DataSourceData | undefined {
    return this.data;
  }

  get breakLoop(): boolean {
    return this._breakLoop;
  }

  constructor(options: { sdkKey: string; streamTimeoutMs?: number }) {
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
    this.streamTimeoutMs = options.streamTimeoutMs ?? 3000;
    this.isBuildStep =
      process.env.CI === '1' ||
      process.env.NEXT_PHASE === 'phase-production-build';

    // Start loading bundled definitions immediately (non-blocking)
    this.bundledDefinitionsPromise = readBundledDefinitions(this.sdkKey);

    this.usageTracker = new UsageTracker({
      sdkKey: this.sdkKey,
      host: this.host,
    });
  }

  private ensureStream(): Promise<void> {
    if (this.streamPromise) return this.streamPromise;

    this.abortController = new AbortController();
    this.isStreamConnected = false;
    this.hasWarnedAboutStaleData = false;

    this.streamPromise = connectStream({
      host: this.host,
      sdkKey: this.sdkKey,
      abortController: this.abortController,
      onMessage: (newData) => {
        this.data = newData;
        this.isStreamConnected = true;
        this.hasWarnedAboutStaleData = false;
      },
      onDisconnect: () => {
        this.isStreamConnected = false;
      },
    });

    return this.streamPromise;
  }

  async initialize(): Promise<void> {
    // Don't stream during build step as the stream never closes
    if (this.isBuildStep) {
      if (!this.data) {
        // Try bundled definitions first during build
        const bundledResult = await this.bundledDefinitionsPromise;
        if (bundledResult?.state === 'ok' && bundledResult.definitions) {
          this.data = bundledResult.definitions;
          return;
        }
        // Fallback to fetchData if bundled definitions unavailable
        this.data = await fetchData(this.host, this.sdkKey);
      }
      return;
    }

    await this.ensureStream();
  }

  async getData(): Promise<DataSourceData> {
    const startTime = Date.now();
    const cacheHadDefinitions = this.data !== undefined;
    const isFirstRead = this.isFirstGetData;
    this.isFirstGetData = false;

    // Build step path: use bundled definitions first, then fetchData
    if (this.isBuildStep) {
      if (!this.data) {
        const bundledResult = await this.bundledDefinitionsPromise;
        if (bundledResult?.state === 'ok' && bundledResult.definitions) {
          this.data = bundledResult.definitions;
          this.trackRead(
            startTime,
            cacheHadDefinitions,
            isFirstRead,
            'embedded',
          );
          return this.data;
        }
        this.data = await fetchData(this.host, this.sdkKey);
      }
      this.trackRead(startTime, cacheHadDefinitions, isFirstRead, 'in-memory');
      return this.data;
    }

    // Runtime path: if we already have data, return it
    if (this.data) {
      // Warn once if returning in-memory data while stream is not connected
      if (!this.isStreamConnected && !this.hasWarnedAboutStaleData) {
        this.hasWarnedAboutStaleData = true;
        console.warn(
          '@vercel/flags-core: Returning in-memory flag definitions while stream is disconnected. Data may be stale.',
        );
      }
      this.trackRead(startTime, cacheHadDefinitions, isFirstRead, 'in-memory');
      return this.data;
    }

    // No data yet - race stream against timeout
    const result = await this.getDataWithTimeout();
    // Determine origin based on whether result came from bundled or stream
    const origin = this.data === result ? 'in-memory' : 'embedded';
    this.trackRead(startTime, cacheHadDefinitions, isFirstRead, origin);
    return result;
  }

  private trackRead(
    startTime: number,
    cacheHadDefinitions: boolean,
    isFirstRead: boolean,
    configOrigin: 'in-memory' | 'embedded',
  ): void {
    const trackOptions: TrackReadOptions = {
      configOrigin,
      cacheStatus: cacheHadDefinitions ? 'HIT' : 'MISS',
      cacheIsBlocking: !cacheHadDefinitions,
      duration: Date.now() - startTime,
    };
    if (isFirstRead) {
      trackOptions.cacheIsFirstRead = true;
    }
    this.usageTracker.trackRead(trackOptions);
  }

  private async getDataWithTimeout(): Promise<DataSourceData> {
    const streamPromise = this.ensureStream().then(() => {
      if (this.data) return this.data;
      throw new Error('Stream connected but no data received');
    });

    // If timeout is 0 or Infinity, don't use timeout
    if (this.streamTimeoutMs <= 0 || !Number.isFinite(this.streamTimeoutMs)) {
      return streamPromise;
    }

    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), this.streamTimeoutMs);
    });

    const result = await Promise.race([streamPromise, timeoutPromise]);

    if (result === 'timeout') {
      // Stream timed out, try bundled definitions
      const bundledResult = await this.bundledDefinitionsPromise;

      if (bundledResult?.state === 'ok' && bundledResult.definitions) {
        console.warn(
          '@vercel/flags-core: Stream timeout, using bundled definitions',
        );
        return bundledResult.definitions;
      }

      console.warn(
        '@vercel/flags-core: Stream timeout and bundled definitions not available, waiting for stream',
      );

      // Bundled definitions not available, wait for stream or use fetchData
      try {
        return await streamPromise;
      } catch {
        // Stream failed completely, try fetchData as last resort
        return fetchData(this.host, this.sdkKey);
      }
    }

    return result;
  }

  async shutdown(): Promise<void> {
    this._breakLoop = true;
    this.abortController?.abort();
    this.abortController = undefined;
    this.streamPromise = undefined;
    this.data = undefined;
    this.isStreamConnected = false;
    this.hasWarnedAboutStaleData = false;
    await this.usageTracker.flush();
  }

  async getMetadata(): Promise<DataSourceMetadata> {
    if (this.data) {
      return { projectId: this.data.projectId };
    }

    const fetched = await fetchData(this.host, this.sdkKey);
    return { projectId: fetched.projectId };
  }

  async ensureFallback(): Promise<void> {
    const bundledResult = await this.bundledDefinitionsPromise;

    if (!bundledResult) {
      throw new Error(
        '@vercel/flags-core: Unable to verify fallback - bundled definitions check failed',
      );
    }

    switch (bundledResult.state) {
      case 'ok':
        return; // Fallback is available

      case 'missing-file':
        throw new Error(
          '@vercel/flags-core: Bundled definitions file not found. ' +
            'Run "vercel-flags prepare" before building to enable fallback.',
        );

      case 'missing-entry':
        throw new Error(
          '@vercel/flags-core: No bundled definitions found for SDK key. ' +
            'Ensure the SDK key is included when running "vercel-flags prepare".',
        );

      case 'unexpected-error':
        throw new Error(
          '@vercel/flags-core: Failed to read bundled definitions: ' +
            String(bundledResult.error),
        );
    }
  }
}
