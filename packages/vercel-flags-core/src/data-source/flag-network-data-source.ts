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

/**
 * Fetches the datafile from the flags service with retry logic.
 *
 * Implements exponential backoff with jitter for transient failures.
 * Does not retry 4xx errors (except 429) as they indicate client errors.
 *
 * @param host - The base URL of the flags service
 * @param sdkKey - The SDK key for authentication
 * @returns The bundled definitions from the remote service
 * @throws Error if all retry attempts fail or a non-retryable error occurs
 */
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

  /**
   * Creates a new FlagNetworkDataSource instance.
   *
   * @param options - Configuration options
   * @param options.sdkKey - The SDK key for authentication (must start with "vf_")
   * @param options.streamTimeoutMs - Optional timeout in milliseconds for stream connection (defaults to 3000ms)
   * @throws Error if the SDK key is invalid or missing
   */
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

  /**
   * Initializes the data source.
   *
   * During build steps, loads bundled definitions or fetches from remote.
   * During runtime, establishes a streaming connection for real-time updates.
   */
  async initialize(): Promise<void> {
    if (this.isBuildStep) {
      await this.initializeForBuildStep();
    } else {
      await this.ensureStream();
    }
  }

  /**
   * Reads the current datafile with metrics.
   *
   * This is the primary method for accessing flag definitions at runtime.
   * It manages stream connections and tracks usage statistics.
   *
   * @returns The datafile including flag definitions and read metrics
   */
  async read(): Promise<Datafile> {
    const startTime = Date.now();
    const cachedData = this.data; // Capture reference to avoid race conditions
    const cacheHadDefinitions = cachedData !== undefined;
    const isFirstRead = this.isFirstGetData;
    this.isFirstGetData = false;

    let result: Omit<Datafile, 'metrics'>;
    let source: Metrics['source'];
    let cacheStatus: Metrics['cacheStatus'];

    if (this.isBuildStep) {
      [result, source, cacheStatus] = await this.getDataForBuildStep();
    } else if (cachedData) {
      [result, source, cacheStatus] = this.getDataFromCache(cachedData);
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
        connectionState: this.isStreamConnected
          ? ('connected' as const)
          : ('disconnected' as const),
      },
    }) satisfies Datafile;
  }

  /**
   * Shuts down the data source and releases resources.
   *
   * Aborts any active stream connection, clears cached data,
   * and flushes pending usage tracking data.
   */
  async shutdown(): Promise<void> {
    this.abortController?.abort();
    this.abortController = undefined;
    this.streamPromise = undefined;
    this.data = undefined;
    this.isStreamConnected = false;
    this.hasWarnedAboutStaleData = false;
    await this.usageTracker.flush();
  }

  /**
   * Returns information about the data source.
   *
   * Uses cached data if available, otherwise fetches from remote.
   *
   * @returns Data source info including the project ID
   */
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
        connectionState: this.isStreamConnected
          ? ('connected' as const)
          : ('disconnected' as const),
      },
    }) satisfies Datafile;
  }

  /**
   * Returns the bundled fallback datafile.
   *
   * Used when the primary data source is unavailable and a fallback is needed.
   *
   * @returns The bundled definitions
   * @throws FallbackNotFoundError if no bundled definitions file exists
   * @throws FallbackEntryNotFoundError if the SDK key entry is missing from bundled definitions
   * @throws Error if reading bundled definitions fails unexpectedly
   */
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

  /**
   * Initializes data for build step environments (CI or production build).
   *
   * Attempts to load bundled definitions first, falls back to remote fetch.
   * Sets the cached data for subsequent reads.
   */
  private async initializeForBuildStep(): Promise<void> {
    if (this.data) return;

    const bundledResult = await this.bundledDefinitionsPromise;
    if (bundledResult?.state === 'ok' && bundledResult.definitions) {
      this.data = bundledResult.definitions;
      return;
    }
    this.data = await fetchDatafile(this.host, this.sdkKey);
  }

  /**
   * Retrieves data during build steps.
   *
   * Priority order:
   * 1. In-memory cache (if available)
   * 2. Bundled definitions
   * 3. Remote fetch
   *
   * @returns A tuple of [datafile, source, cacheStatus]
   */
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

  /**
   * Ensures a streaming connection is established.
   *
   * Creates a new stream connection if one doesn't exist.
   * The stream updates cached data on message receipt and tracks connection state.
   *
   * @returns A promise that resolves when the stream is connected
   */
  private ensureStream(): Promise<void> {
    if (this.streamPromise) return this.streamPromise;

    const abortController = new AbortController();
    this.abortController = abortController;
    this.isStreamConnected = false;
    this.hasWarnedAboutStaleData = false;

    const streamPromise = connectStream(
      {
        host: this.host,
        sdkKey: this.sdkKey,
        abortController,
      },
      {
        onMessage: (newData) => {
          // Update data first, then flags (order matters for consistency)
          this.data = newData;
          this.isStreamConnected = true;
          this.hasWarnedAboutStaleData = false;
        },
        onDisconnect: () => {
          this.isStreamConnected = false;
        },
      },
    );

    // Store promise immediately to prevent race conditions
    this.streamPromise = streamPromise;

    return streamPromise;
  }

  /**
   * Returns data from the in-memory cache.
   *
   * Warns if the stream is disconnected (data may be stale).
   * Cache status is 'HIT' when connected, 'STALE' when disconnected.
   *
   * @param cachedData - Optional pre-captured cached data reference
   * @returns A tuple of [datafile, source, cacheStatus]
   */
  private getDataFromCache(
    cachedData?: Datafile,
  ): [Omit<Datafile, 'metrics'>, Metrics['source'], Metrics['cacheStatus']] {
    const data = cachedData ?? this.data!;
    this.warnIfDisconnected();
    // STALE when stream is disconnected (data may be outdated)
    const cacheStatus = this.isStreamConnected ? 'HIT' : 'STALE';
    return [data, 'in-memory', cacheStatus];
  }

  /**
   * Retrieves data with a timeout on stream connection.
   *
   * Races the stream connection against a configurable timeout.
   * If stream times out, falls back to bundled definitions or remote fetch.
   *
   * @returns A tuple of [datafile, source, cacheStatus]
   */
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

    // Race stream against timeout with cleanup
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      timeoutId = setTimeout(() => resolve('timeout'), this.streamTimeoutMs);
    });

    try {
      const result = await Promise.race([streamPromise, timeoutPromise]);

      if (result === 'timeout') {
        return this.handleStreamTimeout(streamPromise);
      }

      return [result, 'in-memory', 'MISS'];
    } finally {
      // clear timeout if stream wins race or throws
      clearTimeout(timeoutId!);
    }
  }

  /**
   * Handles stream connection timeout by falling back to alternative sources.
   *
   * Attempts bundled definitions first, then waits for stream, and finally
   * falls back to remote fetch if all else fails.
   *
   * @param streamPromise - The pending stream connection promise
   * @returns A tuple of [datafile, source, cacheStatus]
   */
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

  /**
   * Logs a warning if returning cached data while stream is disconnected.
   *
   * Only warns once per disconnection to avoid log spam.
   */
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

  /**
   * Tracks a read operation for usage analytics.
   *
   * Records metrics about cache behavior, timing, and data source origin.
   *
   * @param startTime - The timestamp when the read operation started
   * @param cacheHadDefinitions - Whether the cache had data at read start
   * @param isFirstRead - Whether this is the first read operation
   * @param source - The source from which data was retrieved
   */
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
