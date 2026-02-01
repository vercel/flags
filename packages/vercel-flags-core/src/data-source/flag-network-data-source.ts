import { version } from '../../package.json';
import { FallbackEntryNotFoundError, FallbackNotFoundError } from '../errors';
import type {
  BundledDefinitions,
  BundledDefinitionsResult,
  Datafile,
  DataSource,
  DataSourceInfo,
  Metrics,
} from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import { sleep } from '../utils/sleep';
import { type TrackReadOptions, UsageTracker } from '../utils/usage-tracker';
import { connectStream } from './stream-connection';

const FLAGS_HOST = 'https://flags.vercel.com';
const DEFAULT_STREAM_TIMEOUT_MS = 3000;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const MAX_FETCH_RETRIES = 3;
const FETCH_RETRY_BASE_DELAY_MS = 500;

async function fetchDatafile(
  host: string,
  sdkKey: string,
): Promise<BundledDefinitions> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_FETCH_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      DEFAULT_FETCH_TIMEOUT_MS,
    );

    try {
      const res = await fetch(`${host}/v1/datafile`, {
        headers: {
          Authorization: `Bearer ${sdkKey}`,
          'User-Agent': `VercelFlagsCore/${version}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        // Don't retry 4xx errors (except 429)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new Error(`Failed to fetch data: ${res.statusText}`);
        }
        throw new Error(`Failed to fetch data: ${res.statusText}`);
      }

      return res.json() as Promise<BundledDefinitions>;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError =
        error instanceof Error ? error : new Error('Unknown fetch error');

      // Don't retry 4xx errors (they were thrown above and will propagate)
      if (lastError.message.startsWith('Failed to fetch data:')) {
        throw lastError;
      }

      if (attempt < MAX_FETCH_RETRIES - 1) {
        const delay =
          FETCH_RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Failed to fetch data after retries');
}

/**
 * A DataSource implementation that connects to flags.vercel.com.
 *
 * During build steps (CI or Next.js production build), it uses bundled
 * definitions with a fallback to HTTP fetch.
 *
 * During runtime, it maintains a streaming connection for real-time updates,
 * with bundled definitions as a timeout fallback.
 */
export class FlagNetworkDataSource implements DataSource {
  private sdkKey: string;
  private host = FLAGS_HOST;
  private isBuildStep: boolean;
  private streamTimeoutMs: number;

  // Data state
  private data: Datafile | undefined;
  private bundledDefinitionsPromise: Promise<BundledDefinitionsResult>;

  // Stream state
  private abortController: AbortController | undefined;
  private streamPromise: Promise<void> | undefined;
  private isStreamConnected: boolean = false;
  private hasWarnedAboutStaleData: boolean = false;

  // Usage tracking
  private usageTracker: UsageTracker;
  private isFirstGetData: boolean = true;

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
    this.streamTimeoutMs = options.streamTimeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
    this.isBuildStep =
      process.env.CI === '1' ||
      process.env.NEXT_PHASE === 'phase-production-build';

    this.bundledDefinitionsPromise = readBundledDefinitions(this.sdkKey);
    this.usageTracker = new UsageTracker({
      sdkKey: this.sdkKey,
      host: this.host,
    });
  }

  // ---------------------------------------------------------------------------
  // Public API (DataSource interface)
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isBuildStep) {
      await this.initializeForBuildStep();
    } else {
      await this.ensureStream();
    }
  }

  async read(): Promise<Datafile> {
    const startTime = Date.now();
    const cacheHadDefinitions = this.data !== undefined;
    const isFirstRead = this.isFirstGetData;
    this.isFirstGetData = false;

    let result: Omit<Datafile, 'metrics'>;
    let source: Metrics['source'];
    let cacheStatus: Metrics['cacheStatus'];

    if (this.isBuildStep) {
      [result, source, cacheStatus] = await this.getDataForBuildStep();
    } else if (this.data) {
      [result, source, cacheStatus] = this.getDataFromCache();
    } else {
      [result, source, cacheStatus] = await this.getDataWithStreamTimeout();
    }

    const readMs = Date.now() - startTime;
    this.trackRead(startTime, cacheHadDefinitions, isFirstRead, source);

    return Object.assign(result, {
      metrics: {
        readMs,
        source,
        cacheStatus,
      },
    }) satisfies Datafile;
  }

  async shutdown(): Promise<void> {
    this.abortController?.abort();
    this.abortController = undefined;
    this.streamPromise = undefined;
    this.data = undefined;
    this.isStreamConnected = false;
    this.hasWarnedAboutStaleData = false;
    await this.usageTracker.flush();
  }

  async getInfo(): Promise<DataSourceInfo> {
    if (this.data) {
      return { projectId: this.data.projectId };
    }
    const fetched = await fetchDatafile(this.host, this.sdkKey);
    return { projectId: fetched.projectId };
  }

  /**
   * Returns the datafile with metrics.
   *
   * This method never opens a streaming connection, but will read from
   * the stream if it is already open. This is important because getDatafile
   * may be called during static generation (e.g., generateStaticParams)
   * where opening a persistent connection would be inappropriate.
   *
   * Data retrieval priority:
   * 1. During build steps: uses bundled definitions, falls back to HTTP fetch
   * 2. At runtime with cached data: returns cached data (from stream if connected)
   * 3. At runtime without cached data: uses bundled definitions, falls back to HTTP fetch
   */
  async getDatafile(): Promise<Datafile> {
    const startTime = Date.now();

    let result: Omit<Datafile, 'metrics'>;
    let source: Metrics['source'];
    let cacheStatus: Metrics['cacheStatus'];

    if (this.isBuildStep) {
      [result, source, cacheStatus] = await this.getDataForBuildStep();
    } else if (this.data) {
      [result, source, cacheStatus] = this.getDataFromCache();
    } else {
      [result, source, cacheStatus] = await this.getDataForBuildStep();
    }

    return Object.assign(result, {
      metrics: {
        readMs: Date.now() - startTime,
        source,
        cacheStatus,
      },
    }) satisfies Datafile;
  }

  async getFallbackDatafile(): Promise<BundledDefinitions> {
    const bundledResult = await this.bundledDefinitionsPromise;

    if (!bundledResult) {
      throw new FallbackNotFoundError();
    }

    switch (bundledResult.state) {
      case 'ok':
        return bundledResult.definitions;
      case 'missing-file':
        throw new FallbackNotFoundError();
      case 'missing-entry':
        throw new FallbackEntryNotFoundError();
      case 'unexpected-error':
        throw new Error(
          '@vercel/flags-core: Failed to read bundled definitions: ' +
            String(bundledResult.error),
        );
    }
  }

  // ---------------------------------------------------------------------------
  // Build step helpers
  // ---------------------------------------------------------------------------

  private async initializeForBuildStep(): Promise<void> {
    if (this.data) return;

    const bundledResult = await this.bundledDefinitionsPromise;
    if (bundledResult?.state === 'ok' && bundledResult.definitions) {
      this.data = bundledResult.definitions;
      return;
    }
    this.data = await fetchDatafile(this.host, this.sdkKey);
  }

  private async getDataForBuildStep(): Promise<
    [Omit<Datafile, 'metrics'>, Metrics['source'], Metrics['cacheStatus']]
  > {
    if (this.data) {
      return [this.data, 'in-memory', 'HIT'];
    }

    const bundledResult = await this.bundledDefinitionsPromise;
    if (bundledResult?.state === 'ok' && bundledResult.definitions) {
      this.data = bundledResult.definitions;
      return [this.data, 'embedded', 'MISS'];
    }

    this.data = await fetchDatafile(this.host, this.sdkKey);
    return [this.data, 'remote', 'MISS'];
  }

  // ---------------------------------------------------------------------------
  // Runtime helpers
  // ---------------------------------------------------------------------------

  private ensureStream(): Promise<void> {
    if (this.streamPromise) return this.streamPromise;

    this.abortController = new AbortController();
    this.isStreamConnected = false;
    this.hasWarnedAboutStaleData = false;

    this.streamPromise = connectStream(
      {
        host: this.host,
        sdkKey: this.sdkKey,
        abortController: this.abortController,
      },
      {
        onMessage: (newData) => {
          this.data = newData;
          this.isStreamConnected = true;
          this.hasWarnedAboutStaleData = false;
        },
        onDisconnect: () => {
          this.isStreamConnected = false;
        },
      },
    );

    return this.streamPromise;
  }

  private getDataFromCache(): [
    Omit<Datafile, 'metrics'>,
    Metrics['source'],
    Metrics['cacheStatus'],
  ] {
    this.warnIfDisconnected();
    // STALE when stream is disconnected (data may be outdated)
    const cacheStatus = this.isStreamConnected ? 'HIT' : 'STALE';
    return [this.data!, 'in-memory', cacheStatus];
  }

  private async getDataWithStreamTimeout(): Promise<
    [Omit<Datafile, 'metrics'>, Metrics['source'], Metrics['cacheStatus']]
  > {
    const streamPromise = this.ensureStream().then(() => {
      if (this.data) return this.data;
      throw new Error('Stream connected but no data received');
    });

    // If timeout disabled, just wait for stream
    if (this.streamTimeoutMs <= 0 || !Number.isFinite(this.streamTimeoutMs)) {
      const data = await streamPromise;
      return [data, 'in-memory', 'MISS'];
    }

    // Race stream against timeout
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), this.streamTimeoutMs);
    });

    const result = await Promise.race([streamPromise, timeoutPromise]);

    if (result === 'timeout') {
      return this.handleStreamTimeout(streamPromise);
    }

    return [result, 'in-memory', 'MISS'];
  }

  private async handleStreamTimeout(
    streamPromise: Promise<Omit<Datafile, 'metrics'>>,
  ): Promise<
    [Omit<Datafile, 'metrics'>, Metrics['source'], Metrics['cacheStatus']]
  > {
    const bundledResult = await this.bundledDefinitionsPromise;

    if (bundledResult?.state === 'ok' && bundledResult.definitions) {
      console.warn(
        '@vercel/flags-core: Stream timeout, using bundled definitions',
      );
      // STALE because we're falling back to bundled definitions due to stream timeout
      return [bundledResult.definitions, 'embedded', 'STALE'];
    }

    console.warn(
      '@vercel/flags-core: Stream timeout and bundled definitions not available, waiting for stream',
    );

    // Bundled definitions not available, wait for stream or fetch as last resort
    try {
      const data = await streamPromise;
      return [data, 'in-memory', 'MISS'];
    } catch {
      const data = await fetchDatafile(this.host, this.sdkKey);
      // STALE because we're falling back to remote fetch due to stream failure
      return [data, 'remote', 'STALE'];
    }
  }

  private warnIfDisconnected(): void {
    if (!this.isStreamConnected && !this.hasWarnedAboutStaleData) {
      this.hasWarnedAboutStaleData = true;
      console.warn(
        '@vercel/flags-core: Returning in-memory flag definitions while stream is disconnected. Data may be stale.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Usage tracking
  // ---------------------------------------------------------------------------

  private trackRead(
    startTime: number,
    cacheHadDefinitions: boolean,
    isFirstRead: boolean,
    source: Metrics['source'],
  ): void {
    // Map source to configOrigin for usage tracker (it expects 'in-memory' | 'embedded')
    const configOrigin: 'in-memory' | 'embedded' =
      source === 'embedded' ? 'embedded' : 'in-memory';
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
}
