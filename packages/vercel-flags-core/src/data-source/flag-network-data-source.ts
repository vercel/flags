import { version } from '../../package.json';
import { FallbackEntryNotFoundError, FallbackNotFoundError } from '../errors';
import type {
  BundledDefinitions,
  BundledDefinitionsResult,
  Datafile,
  DatafileInput,
  DataSource,
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
   * Initial datafile to use immediately
   * - At runtime: used while waiting for stream/poll, then updated in background
   * - At build step: used as primary source (skips network)
   */
  datafile?: DatafileInput;

  /**
   * Configure streaming connection (runtime only, ignored during build step)
   * - `true`: Enable with default options (initTimeoutMs: 3000)
   * - `false`: Disable streaming
   * - `{ initTimeoutMs: number }`: Enable with custom timeout
   * @default true
   */
  stream?: boolean | StreamOptions;

  /**
   * Configure polling fallback (runtime only, ignored during build step)
   * - `true`: Enable with default options (intervalMs: 30000, initTimeoutMs: 3000)
   * - `false`: Disable polling
   * - `{ intervalMs: number, initTimeoutMs: number }`: Enable with custom options
   * @default true
   */
  polling?: boolean | PollingOptions;

  /**
   * Override build step detection
   * - `true`: Treat as build step (use datafile/bundled only, no network)
   * - `false`: Treat as runtime (try stream/poll first)
   * @default auto-detected via CI=1 or NEXT_PHASE=phase-production-build
   */
  buildStep?: boolean;

  /**
   * Custom fetch function for making HTTP requests.
   * Useful for testing (e.g. resolving to a different IP).
   * @default globalThis.fetch
   */
  fetch?: typeof globalThis.fetch;
};

/**
 * Normalized internal options
 */
type NormalizedOptions = {
  sdkKey: string;
  datafile: DatafileInput | undefined;
  stream: { enabled: boolean; initTimeoutMs: number };
  polling: { enabled: boolean; intervalMs: number; initTimeoutMs: number };
  buildStep: boolean;
  fetch: typeof globalThis.fetch;
};

/**
 * Normalizes user-provided options to internal format with defaults
 */
function normalizeOptions(
  options: FlagNetworkDataSourceOptions,
): NormalizedOptions {
  const autoDetectedBuildStep =
    process.env.CI === '1' ||
    process.env.NEXT_PHASE === 'phase-production-build';
  const buildStep = options.buildStep ?? autoDetectedBuildStep;

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
    datafile: options.datafile,
    stream,
    polling,
    buildStep,
    fetch: options.fetch ?? globalThis.fetch,
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
  fetchFn: typeof globalThis.fetch,
): Promise<BundledDefinitions> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_FETCH_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      DEFAULT_FETCH_TIMEOUT_MS,
    );

    let shouldRetry = true;
    try {
      const res = await fetchFn(`${host}/v1/datafile`, {
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
          shouldRetry = false;
        }
        throw new Error(`Failed to fetch data: ${res.statusText}`);
      }

      return res.json() as Promise<BundledDefinitions>;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError =
        error instanceof Error ? error : new Error('Unknown fetch error');

      if (!shouldRetry) throw lastError;

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
 * Behavior differs based on environment:
 *
 * **Build step** (CI=1 or Next.js build, or buildStep: true):
 * - Uses datafile (if provided) or bundled definitions
 * - No streaming or polling (avoids network during build)
 *
 * **Runtime** (default):
 * - Tries stream first, then poll, then datafile, then bundled
 * - Stream and polling never run simultaneously
 * - If stream reconnects while polling → stop polling
 * - If stream disconnects → start polling (if enabled)
 */
export class FlagNetworkDataSource implements DataSource {
  private options: NormalizedOptions;
  private host = FLAGS_HOST;

  // Data state
  private data: DatafileInput | undefined;
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

    // Always load bundled definitions as ultimate fallback
    this.bundledDefinitionsPromise = readBundledDefinitions(
      this.options.sdkKey,
    );

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
   * Build step: datafile → bundled → fetch
   * Runtime: stream → poll → datafile → bundled
   */
  async initialize(): Promise<void> {
    if (this.options.buildStep) {
      await this.initializeForBuildStep();
      return;
    }

    // Hydrate from provided datafile if not already set (e.g., after shutdown)
    // Usually the constructor sets this, but if the client was shutdown and
    // then init'd again we need to set it again. This also means that any
    // previous data we've seen before shutdown is lost. We'll "start fresh".
    if (!this.data && this.options.datafile) {
      this.data = this.options.datafile;
    }

    // If we already have data (from provided datafile), start background updates
    // but don't block on them
    if (this.data) {
      this.startBackgroundUpdates();
      return;
    }

    // read bundled definitions
    await this.initializeFromBundled();

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

    throw new Error('@vercel/flags-core: No flag definitions available.');
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

    let result: DatafileInput;
    let source: Metrics['source'];
    let cacheStatus: Metrics['cacheStatus'];

    if (this.options.buildStep) {
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
    this.data = this.options.datafile;
    this.isStreamConnected = false;
    this.hasWarnedAboutStaleData = false;
    await this.usageTracker.flush();
  }

  /**
   * Returns the datafile with metrics.
   *
   * During builds this will read from the bundled file if available.
   *
   * This method never opens a streaming connection, but will read from
   * the stream if it is already open. Otherwise it fetches over the network.
   */
  async getDatafile(): Promise<Datafile> {
    const startTime = Date.now();

    let result: DatafileInput;
    let source: Metrics['source'];
    let cacheStatus: Metrics['cacheStatus'];

    if (this.options.buildStep) {
      [result, source, cacheStatus] = await this.getDataForBuildStep();
    } else if (this.isStreamConnected && this.data) {
      [result, source, cacheStatus] = this.getDataFromCache();
    } else {
      const fetched = await fetchDatafile(
        this.host,
        this.options.sdkKey,
        this.options.fetch,
      );
      if (this.isNewerData(fetched)) {
        this.data = fetched;
      }
      [result, source, cacheStatus] = [this.data ?? fetched, 'remote', 'MISS'];
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
    let streamPromise: Promise<void>;

    if (this.options.stream.initTimeoutMs <= 0) {
      // No timeout - wait indefinitely
      try {
        streamPromise = this.startStream();
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
      streamPromise = this.startStream();
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
          fetch: this.options.fetch,
          getRevision: () => this.data?.revision,
        },
        {
          onMessage: (newData) => {
            if (this.isNewerData(newData)) {
              this.data = newData;
            }
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
          onPrimed: () => {
            this.isStreamConnected = true;
            this.hasWarnedAboutStaleData = false;

            if (this.pollingIntervalId) {
              this.stopPolling();
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
      const data = await fetchDatafile(
        this.host,
        this.options.sdkKey,
        this.options.fetch,
      );
      if (this.isNewerData(data)) {
        this.data = data;
      }
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

    this.data = await fetchDatafile(
      this.host,
      this.options.sdkKey,
      this.options.fetch,
    );
  }

  /**
   * Retrieves data during build steps.
   */
  private async getDataForBuildStep(): Promise<
    [DatafileInput, Metrics['source'], Metrics['cacheStatus']]
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

    this.data = await fetchDatafile(
      this.host,
      this.options.sdkKey,
      this.options.fetch,
    );
    return [this.data, 'remote', 'MISS'];
  }

  // ---------------------------------------------------------------------------
  // Runtime helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns data from the in-memory cache.
   */
  private getDataFromCache(
    cachedData?: DatafileInput,
  ): [DatafileInput, Metrics['source'], Metrics['cacheStatus']] {
    const data = cachedData ?? this.data!;
    this.warnIfDisconnected();
    const cacheStatus = this.isStreamConnected ? 'HIT' : 'STALE';
    return [data, 'in-memory', cacheStatus];
  }

  /**
   * Retrieves data using the fallback chain.
   */
  private async getDataWithFallbacks(): Promise<
    [DatafileInput, Metrics['source'], Metrics['cacheStatus']]
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
  }

  /**
   * Parses a configUpdatedAt value (number or string) into a numeric timestamp.
   * Returns undefined if the value is missing or cannot be parsed.
   */
  private static parseConfigUpdatedAt(value: unknown): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  /**
   * Checks if the incoming data is newer than the current in-memory data.
   * Returns true if the update should proceed, false if it should be skipped.
   *
   * Always accepts the update if:
   * - There is no current data
   * - The current data has no configUpdatedAt
   * - The incoming data has no configUpdatedAt
   *
   * Skips the update only when both have configUpdatedAt and incoming is older.
   */
  private isNewerData(incoming: DatafileInput): boolean {
    if (!this.data) return true;

    const currentTs = FlagNetworkDataSource.parseConfigUpdatedAt(
      this.data.configUpdatedAt,
    );
    const incomingTs = FlagNetworkDataSource.parseConfigUpdatedAt(
      incoming.configUpdatedAt,
    );

    if (currentTs === undefined || incomingTs === undefined) {
      return true;
    }

    return incomingTs >= currentTs;
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
    const configUpdatedAt = this.data?.configUpdatedAt;
    if (typeof configUpdatedAt === 'number') {
      trackOptions.configUpdatedAt = configUpdatedAt;
    }
    if (isFirstRead) {
      trackOptions.cacheIsFirstRead = true;
    }
    this.usageTracker.trackRead(trackOptions);
  }
}
