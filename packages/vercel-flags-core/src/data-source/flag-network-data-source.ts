import { version } from '../../package.json';
import { FallbackEntryNotFoundError, FallbackNotFoundError } from '../errors';
import type {
  BundledDefinitions,
  BundledDefinitionsResult,
  Datafile,
  DataSource,
  DataSourceInfo,
  Metrics,
  PollingOptions,
  StreamOptions,
} from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import { sleep } from '../utils/sleep';
import { type TrackReadOptions, UsageTracker } from '../utils/usage-tracker';
import { connectStream } from './stream-connection';

const FLAGS_HOST = 'https://flags.vercel.com';
const DEFAULT_STREAM_INIT_TIMEOUT_MS = 3000;
const DEFAULT_POLLING_INTERVAL_MS = 30_000;
const DEFAULT_POLLING_INIT_TIMEOUT_MS = 3_000;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const MAX_FETCH_RETRIES = 3;
const FETCH_RETRY_BASE_DELAY_MS = 500;

/**
 * Configuration options for FlagNetworkDataSource
 */
export type FlagNetworkDataSourceOptions = {
  /** SDK key for authentication (must start with "vf_") */
  sdkKey: string;

  /**
   * Enable/configure streaming connection
   * - `true`: Enable with default options (initTimeoutMs: 3000)
   * - `false`: Disable streaming
   * - `{ initTimeoutMs: number }`: Enable with custom timeout
   */
  stream?: boolean | StreamOptions;

  /**
   * Enable/configure polling
   * - `true`: Enable with default options (intervalMs: 30000, initTimeoutMs: 10000)
   * - `false`: Disable polling
   * - `{ intervalMs: number, initTimeoutMs: number }`: Enable with custom options
   */
  polling?: boolean | PollingOptions;

  /**
   * Initial datafile to use immediately (e.g., from SSR props)
   * When provided, this data is used immediately while background updates happen
   */
  datafile?: Datafile;
};

/**
 * Normalized internal options
 */
type NormalizedOptions = {
  sdkKey: string;
  stream: { enabled: boolean; initTimeoutMs: number };
  polling: { enabled: boolean; intervalMs: number; initTimeoutMs: number };
  datafile: Datafile | undefined;
};

/**
 * Normalizes user-provided options to internal format with defaults
 */
function normalizeOptions(
  options: FlagNetworkDataSourceOptions,
): NormalizedOptions {
  let stream: NormalizedOptions['stream'];
  if (options.stream === undefined || options.stream === true) {
    stream = { enabled: true, initTimeoutMs: DEFAULT_STREAM_INIT_TIMEOUT_MS };
  } else if (options.stream === false) {
    stream = { enabled: false, initTimeoutMs: 0 };
  } else {
    stream = { enabled: true, initTimeoutMs: options.stream.initTimeoutMs };
  }

  let polling: NormalizedOptions['polling'];
  if (options.polling === undefined || options.polling === true) {
    polling = {
      enabled: true,
      intervalMs: DEFAULT_POLLING_INTERVAL_MS,
      initTimeoutMs: DEFAULT_POLLING_INIT_TIMEOUT_MS,
    };
  } else if (options.polling === false) {
    polling = { enabled: false, intervalMs: 0, initTimeoutMs: 0 };
  } else {
    polling = {
      enabled: true,
      intervalMs: options.polling.intervalMs,
      initTimeoutMs: options.polling.initTimeoutMs,
    };
  }

  return {
    sdkKey: options.sdkKey,
    stream,
    polling,
    datafile: options.datafile,
  };
}

/**
 * Fetches the datafile from the flags service with retry logic.
 *
 * Implements exponential backoff with jitter for transient failures.
 * Does not retry 4xx errors (except 429) as they indicate client errors.
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
 * Supports multiple data fetching mechanisms with fallback:
 * 1. Streaming - real-time updates via SSE
 * 2. Polling - interval-based HTTP requests
 * 3. Provided datafile - initial data passed in options
 * 4. Bundled definitions - build-time packaged definitions
 *
 * Stream and polling never run simultaneously. If stream is available,
 * polling is stopped. If stream disconnects, polling is started as fallback.
 */
export class FlagNetworkDataSource implements DataSource {
  private options: NormalizedOptions;
  private host = FLAGS_HOST;
  private isBuildStep: boolean;

  // Data state
  private data: Datafile | undefined;
  private bundledDefinitionsPromise:
    | Promise<BundledDefinitionsResult>
    | undefined;

  // Stream state
  private streamAbortController: AbortController | undefined;
  private streamPromise: Promise<void> | undefined;
  private isStreamConnected: boolean = false;
  private hasWarnedAboutStaleData: boolean = false;

  // Polling state
  private pollingIntervalId: ReturnType<typeof setInterval> | undefined;
  private pollingAbortController: AbortController | undefined;

  // Usage tracking
  private usageTracker: UsageTracker;
  private isFirstGetData: boolean = true;

  /**
   * Creates a new FlagNetworkDataSource instance.
   */
  constructor(options: FlagNetworkDataSourceOptions) {
    if (
      !options.sdkKey ||
      typeof options.sdkKey !== 'string' ||
      !options.sdkKey.startsWith('vf_')
    ) {
      throw new Error(
        '@vercel/flags-core: SDK key must be a string starting with "vf_"',
      );
    }

    this.options = normalizeOptions(options);
    this.isBuildStep =
      process.env.CI === '1' ||
      process.env.NEXT_PHASE === 'phase-production-build';

    // Only load bundled definitions if no datafile was provided
    if (!this.options.datafile) {
      this.bundledDefinitionsPromise = readBundledDefinitions(
        this.options.sdkKey,
      );
    }

    // If datafile provided, use it immediately
    if (this.options.datafile) {
      this.data = this.options.datafile;
    }

    this.usageTracker = new UsageTracker({
      sdkKey: this.options.sdkKey,
      host: this.host,
    });
  }

  // ---------------------------------------------------------------------------
  // Public API (DataSource interface)
  // ---------------------------------------------------------------------------

  /**
   * Initializes the data source.
   *
   * Fallback chain:
   * 1. Try stream (if enabled) with initTimeoutMs
   * 2. Try polling (if enabled) with initTimeoutMs
   * 3. Use provided datafile or bundled definitions
   */
  async initialize(): Promise<void> {
    if (this.isBuildStep) {
      await this.initializeForBuildStep();
      return;
    }

    // If we already have data (from provided datafile), start background updates
    // but don't block on them
    if (this.data) {
      this.startBackgroundUpdates();
      return;
    }

    // Try stream first
    if (this.options.stream.enabled) {
      const streamSuccess = await this.tryInitializeStream();
      if (streamSuccess) return;
    }

    // Fall back to polling
    if (this.options.polling.enabled) {
      const pollingSuccess = await this.tryInitializePolling();
      if (pollingSuccess) return;
    }

    // Fall back to provided datafile (already set in constructor if provided)
    if (this.data) return;

    // Fall back to bundled definitions
    await this.initializeFromBundled();
  }

  /**
   * Reads the current datafile with metrics.
   */
  async read(): Promise<Datafile> {
    const startTime = Date.now();
    const cachedData = this.data;
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
      [result, source, cacheStatus] = await this.getDataWithFallbacks();
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
   */
  async shutdown(): Promise<void> {
    this.stopStream();
    this.stopPolling();
    this.data = undefined;
    this.isStreamConnected = false;
    this.hasWarnedAboutStaleData = false;
    await this.usageTracker.flush();
  }

  /**
   * Returns information about the data source.
   */
  async getInfo(): Promise<DataSourceInfo> {
    if (this.data) {
      return { projectId: this.data.projectId };
    }
    const fetched = await fetchDatafile(this.host, this.options.sdkKey);
    return { projectId: fetched.projectId };
  }

  /**
   * Returns the datafile with metrics.
   *
   * This method never opens a streaming connection, but will read from
   * the stream if it is already open.
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
   */
  async getFallbackDatafile(): Promise<BundledDefinitions> {
    if (!this.bundledDefinitionsPromise) {
      throw new FallbackNotFoundError();
    }

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
  // Stream management
  // ---------------------------------------------------------------------------

  /**
   * Attempts to initialize via stream with timeout.
   * Returns true if stream connected successfully within timeout.
   */
  private async tryInitializeStream(): Promise<boolean> {
    const streamPromise = this.startStream();

    if (this.options.stream.initTimeoutMs <= 0) {
      // No timeout - wait indefinitely
      try {
        await streamPromise;
        return true;
      } catch {
        return false;
      }
    }

    // Race against timeout
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      timeoutId = setTimeout(
        () => resolve('timeout'),
        this.options.stream.initTimeoutMs,
      );
    });

    try {
      const result = await Promise.race([streamPromise, timeoutPromise]);
      clearTimeout(timeoutId!);

      if (result === 'timeout') {
        console.warn(
          '@vercel/flags-core: Stream initialization timeout, falling back',
        );
        // Don't abort stream - let it continue trying in background
        return false;
      }

      return true;
    } catch {
      clearTimeout(timeoutId!);
      return false;
    }
  }

  /**
   * Starts the stream connection with callbacks for data and disconnect.
   */
  private startStream(): Promise<void> {
    if (this.streamPromise) return this.streamPromise;

    this.streamAbortController = new AbortController();
    this.isStreamConnected = false;
    this.hasWarnedAboutStaleData = false;

    try {
      const streamPromise = connectStream(
        {
          host: this.host,
          sdkKey: this.options.sdkKey,
          abortController: this.streamAbortController,
        },
        {
          onMessage: (newData) => {
            this.data = newData;
            this.isStreamConnected = true;
            this.hasWarnedAboutStaleData = false;

            // Stream is working - stop polling if it's running
            if (this.pollingIntervalId) {
              this.stopPolling();
            }
          },
          onDisconnect: () => {
            this.isStreamConnected = false;

            // Fall back to polling if enabled and not already polling
            if (this.options.polling.enabled && !this.pollingIntervalId) {
              this.startPolling();
            }
          },
        },
      );

      this.streamPromise = streamPromise;
      return streamPromise;
    } catch (error) {
      this.streamPromise = undefined;
      this.streamAbortController = undefined;
      throw error;
    }
  }

  /**
   * Stops the stream connection.
   */
  private stopStream(): void {
    this.streamAbortController?.abort();
    this.streamAbortController = undefined;
    this.streamPromise = undefined;
  }

  // ---------------------------------------------------------------------------
  // Polling management
  // ---------------------------------------------------------------------------

  /**
   * Attempts to initialize via polling with timeout.
   * Returns true if first poll succeeded within timeout.
   */
  private async tryInitializePolling(): Promise<boolean> {
    this.pollingAbortController = new AbortController();

    // Perform initial poll
    const pollPromise = this.performPoll();

    if (this.options.polling.initTimeoutMs <= 0) {
      // No timeout - wait indefinitely
      try {
        await pollPromise;
        if (this.data) {
          this.startPollingInterval();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    }

    // Race against timeout
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      timeoutId = setTimeout(
        () => resolve('timeout'),
        this.options.polling.initTimeoutMs,
      );
    });

    try {
      const result = await Promise.race([pollPromise, timeoutPromise]);
      clearTimeout(timeoutId!);

      if (result === 'timeout') {
        console.warn(
          '@vercel/flags-core: Polling initialization timeout, falling back',
        );
        return false;
      }

      if (this.data) {
        this.startPollingInterval();
        return true;
      }
      return false;
    } catch {
      clearTimeout(timeoutId!);
      return false;
    }
  }

  /**
   * Starts polling (initial poll + interval).
   */
  private startPolling(): void {
    if (this.pollingIntervalId) return;

    this.pollingAbortController = new AbortController();

    // Perform initial poll
    void this.performPoll();

    // Start interval
    this.startPollingInterval();
  }

  /**
   * Starts the polling interval (without initial poll).
   */
  private startPollingInterval(): void {
    if (this.pollingIntervalId) return;

    this.pollingIntervalId = setInterval(
      () => void this.performPoll(),
      this.options.polling.intervalMs,
    );
  }

  /**
   * Stops polling.
   */
  private stopPolling(): void {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = undefined;
    }
    this.pollingAbortController?.abort();
    this.pollingAbortController = undefined;
  }

  /**
   * Performs a single poll request.
   */
  private async performPoll(): Promise<void> {
    if (this.pollingAbortController?.signal.aborted) return;

    try {
      const data = await fetchDatafile(this.host, this.options.sdkKey);
      this.data = data;
    } catch (error) {
      console.error('@vercel/flags-core: Poll failed:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Background updates
  // ---------------------------------------------------------------------------

  /**
   * Starts background updates (stream or polling) without blocking.
   * Used when we already have data from provided datafile.
   */
  private startBackgroundUpdates(): void {
    if (this.options.stream.enabled) {
      void this.startStream();
    } else if (this.options.polling.enabled) {
      this.startPolling();
    }
  }

  // ---------------------------------------------------------------------------
  // Build step helpers
  // ---------------------------------------------------------------------------

  /**
   * Initializes data for build step environments.
   */
  private async initializeForBuildStep(): Promise<void> {
    if (this.data) return;

    if (this.bundledDefinitionsPromise) {
      const bundledResult = await this.bundledDefinitionsPromise;
      if (bundledResult?.state === 'ok' && bundledResult.definitions) {
        this.data = bundledResult.definitions;
        return;
      }
    }

    this.data = await fetchDatafile(this.host, this.options.sdkKey);
  }

  /**
   * Retrieves data during build steps.
   */
  private async getDataForBuildStep(): Promise<
    [Omit<Datafile, 'metrics'>, Metrics['source'], Metrics['cacheStatus']]
  > {
    if (this.data) {
      return [this.data, 'in-memory', 'HIT'];
    }

    if (this.bundledDefinitionsPromise) {
      const bundledResult = await this.bundledDefinitionsPromise;
      if (bundledResult?.state === 'ok' && bundledResult.definitions) {
        this.data = bundledResult.definitions;
        return [this.data, 'embedded', 'MISS'];
      }
    }

    this.data = await fetchDatafile(this.host, this.options.sdkKey);
    return [this.data, 'remote', 'MISS'];
  }

  // ---------------------------------------------------------------------------
  // Runtime helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns data from the in-memory cache.
   */
  private getDataFromCache(
    cachedData?: Datafile,
  ): [Omit<Datafile, 'metrics'>, Metrics['source'], Metrics['cacheStatus']] {
    const data = cachedData ?? this.data!;
    this.warnIfDisconnected();
    const cacheStatus = this.isStreamConnected ? 'HIT' : 'STALE';
    return [data, 'in-memory', cacheStatus];
  }

  /**
   * Retrieves data using the fallback chain.
   */
  private async getDataWithFallbacks(): Promise<
    [Omit<Datafile, 'metrics'>, Metrics['source'], Metrics['cacheStatus']]
  > {
    // Try stream with timeout
    if (this.options.stream.enabled) {
      const streamSuccess = await this.tryInitializeStream();
      if (streamSuccess && this.data) {
        return [this.data, 'in-memory', 'MISS'];
      }
    }

    // Try polling with timeout
    if (this.options.polling.enabled) {
      const pollingSuccess = await this.tryInitializePolling();
      if (pollingSuccess && this.data) {
        return [this.data, 'remote', 'MISS'];
      }
    }

    // Use provided datafile
    if (this.options.datafile) {
      this.data = this.options.datafile;
      return [this.data, 'in-memory', 'STALE'];
    }

    // Use bundled definitions
    if (this.bundledDefinitionsPromise) {
      const bundledResult = await this.bundledDefinitionsPromise;
      if (bundledResult?.state === 'ok' && bundledResult.definitions) {
        console.warn(
          '@vercel/flags-core: Using bundled definitions as fallback',
        );
        this.data = bundledResult.definitions;
        return [this.data, 'embedded', 'STALE'];
      }
    }

    throw new Error(
      '@vercel/flags-core: No flag definitions available. ' +
        'Ensure streaming/polling is enabled or provide a datafile.',
    );
  }

  /**
   * Initializes from bundled definitions.
   */
  private async initializeFromBundled(): Promise<void> {
    if (!this.bundledDefinitionsPromise) {
      throw new Error(
        '@vercel/flags-core: No flag definitions available. ' +
          'Ensure streaming/polling is enabled or provide a datafile.',
      );
    }

    const bundledResult = await this.bundledDefinitionsPromise;
    if (bundledResult?.state === 'ok' && bundledResult.definitions) {
      this.data = bundledResult.definitions;
      return;
    }

    throw new Error(
      '@vercel/flags-core: No flag definitions available. ' +
        'Bundled definitions not found.',
    );
  }

  /**
   * Logs a warning if returning cached data while stream is disconnected.
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
   */
  private trackRead(
    startTime: number,
    cacheHadDefinitions: boolean,
    isFirstRead: boolean,
    source: Metrics['source'],
  ): void {
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
