import { version } from '../../package.json';
import type {
  BundledDefinitions,
  BundledDefinitionsResult,
  DataSource,
  DataSourceData,
  DataSourceInfo,
  ReadMetadata,
  ReadResult,
} from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import { type TrackReadOptions, UsageTracker } from '../utils/usage-tracker';
import { connectStream } from './stream-connection';

const FLAGS_HOST = 'https://flags.vercel.com';
const DEFAULT_STREAM_TIMEOUT_MS = 3000;

async function fetchDatafile(
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
  private data: DataSourceData | undefined;
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

  async read(): Promise<ReadResult> {
    const startTime = Date.now();
    const cacheHadDefinitions = this.data !== undefined;
    const isFirstRead = this.isFirstGetData;
    this.isFirstGetData = false;

    let result: DataSourceData;
    let source: ReadMetadata['source'];
    let cacheStatus: ReadMetadata['cacheStatus'];

    if (this.isBuildStep) {
      [result, source, cacheStatus] = await this.getDataForBuildStep();
    } else if (this.data) {
      [result, source, cacheStatus] = this.getDataFromCache();
    } else {
      [result, source, cacheStatus] = await this.getDataWithStreamTimeout();
    }

    const durationMs = Date.now() - startTime;
    this.trackRead(startTime, cacheHadDefinitions, isFirstRead, source);

    return {
      data: result,
      metadata: {
        durationMs,
        source,
        cacheStatus,
      },
    };
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

  async ensureFallback(): Promise<void> {
    const bundledResult = await this.bundledDefinitionsPromise;

    if (!bundledResult) {
      throw new Error(
        '@vercel/flags-core: Unable to verify fallback - bundled definitions check failed',
      );
    }

    switch (bundledResult.state) {
      case 'ok':
        return;
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
    [DataSourceData, ReadMetadata['source'], ReadMetadata['cacheStatus']]
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
    DataSourceData,
    ReadMetadata['source'],
    ReadMetadata['cacheStatus'],
  ] {
    this.warnIfDisconnected();
    // STALE when stream is disconnected (data may be outdated)
    const cacheStatus = this.isStreamConnected ? 'HIT' : 'STALE';
    return [this.data!, 'in-memory', cacheStatus];
  }

  private async getDataWithStreamTimeout(): Promise<
    [DataSourceData, ReadMetadata['source'], ReadMetadata['cacheStatus']]
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
    streamPromise: Promise<DataSourceData>,
  ): Promise<
    [DataSourceData, ReadMetadata['source'], ReadMetadata['cacheStatus']]
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
    source: ReadMetadata['source'],
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
