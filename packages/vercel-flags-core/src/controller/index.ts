import type {
  BundledDefinitions,
  Datafile,
  DatafileInput,
  DataSource,
  Metrics,
  PollingOptions,
  StreamOptions,
} from '../types';
import { type TrackReadOptions, UsageTracker } from '../utils/usage-tracker';
import { BundledSource } from './bundled-source';
import { fetchDatafile } from './fetch-datafile';
import { PollingSource } from './polling-source';
import { StreamSource } from './stream-source';
import { originToMetricsSource, type TaggedData, tagData } from './tagged-data';

export { BundledSource } from './bundled-source';
export { PollingSource } from './polling-source';
export { StreamSource } from './stream-source';

const FLAGS_HOST = 'https://flags.vercel.com';
const DEFAULT_STREAM_INIT_TIMEOUT_MS = 3000;
const DEFAULT_POLLING_INTERVAL_MS = 30_000;
const DEFAULT_POLLING_INIT_TIMEOUT_MS = 3_000;

/**
 * Configuration options for Controller
 */
export type ControllerOptions = {
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

  /**
   * Custom source modules for dependency injection (testing).
   * When provided, these replace the default source instances.
   */
  sources?: {
    stream?: StreamSource;
    polling?: PollingSource;
    bundled?: BundledSource;
  };
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type NormalizedOptions = {
  sdkKey: string;
  datafile: DatafileInput | undefined;
  stream: { enabled: boolean; initTimeoutMs: number };
  polling: { enabled: boolean; intervalMs: number; initTimeoutMs: number };
  buildStep: boolean;
  fetch: typeof globalThis.fetch;
};

/**
 * Explicit states for the controller state machine.
 */
type State =
  | 'idle'
  | 'initializing:stream'
  | 'initializing:polling'
  | 'initializing:fallback'
  | 'streaming'
  | 'polling'
  | 'degraded'
  | 'build:loading'
  | 'build:ready'
  | 'shutdown';

// ---------------------------------------------------------------------------
// Option normalization
// ---------------------------------------------------------------------------

function normalizeOptions(options: ControllerOptions): NormalizedOptions {
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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Parses a configUpdatedAt value (number or string) into a numeric timestamp.
 * Returns undefined if the value is missing or cannot be parsed.
 */
function parseConfigUpdatedAt(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * A DataSource implementation that connects to flags.vercel.com.
 *
 * Implemented as a state machine controller that delegates all I/O to
 * source modules (StreamSource, PollingSource, BundledSource).
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
export class Controller implements DataSource {
  private options: NormalizedOptions;
  private host = FLAGS_HOST;

  // State machine
  private state: State = 'idle';

  // Data state — tagged with origin
  private data: TaggedData | undefined;

  // Sources (I/O delegates)
  private streamSource: StreamSource;
  private pollingSource: PollingSource;
  private bundledSource: BundledSource;

  // UI state
  private hasWarnedAboutStaleData: boolean = false;

  // Usage tracking
  private usageTracker: UsageTracker;
  private isFirstGetData: boolean = true;

  constructor(options: ControllerOptions) {
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

    // Create source modules (or use injected ones for testing)
    this.streamSource =
      options.sources?.stream ??
      new StreamSource({
        host: this.host,
        sdkKey: this.options.sdkKey,
        fetch: this.options.fetch,
      });

    this.pollingSource =
      options.sources?.polling ??
      new PollingSource({
        host: this.host,
        sdkKey: this.options.sdkKey,
        intervalMs: this.options.polling.intervalMs,
        fetch: this.options.fetch,
      });

    this.bundledSource =
      options.sources?.bundled ?? new BundledSource(this.options.sdkKey);

    // Wire source events to state machine
    this.wireSourceEvents();

    // If datafile provided, use it immediately
    if (this.options.datafile) {
      this.data = tagData(this.options.datafile, 'provided');
    }

    this.usageTracker = new UsageTracker({
      sdkKey: this.options.sdkKey,
      host: this.host,
    });
  }

  // ---------------------------------------------------------------------------
  // Source event wiring
  // ---------------------------------------------------------------------------

  private wireSourceEvents(): void {
    // Stream events
    this.streamSource.on('data', (data) => {
      if (this.isNewerData(data)) {
        this.data = data;
      }
      this.hasWarnedAboutStaleData = false;
    });

    this.streamSource.on('connected', () => {
      // Stream reconnected while polling → stop polling, transition to streaming
      if (this.state === 'polling') {
        this.pollingSource.stop();
        this.transition('streaming');
      }
      // During normal streaming, just confirm state
      else if (this.state === 'streaming') {
        // Already in streaming state, no transition needed
      }
      // During initialization, initialize() handles the transition
    });

    this.streamSource.on('disconnected', () => {
      // Only react to disconnects when we're in streaming state.
      // During initialization states, initialize() manages its own fallback chain.
      if (this.state === 'streaming') {
        if (this.options.polling.enabled) {
          this.pollingSource.startInterval();
          this.transition('polling');
        } else {
          this.transition('degraded');
        }
      }
    });

    // Polling events
    this.pollingSource.on('data', (data) => {
      if (this.isNewerData(data)) {
        this.data = data;
      }
    });

    this.pollingSource.on('error', (error) => {
      console.error('@vercel/flags-core: Poll failed:', error);
    });
  }

  // ---------------------------------------------------------------------------
  // State machine
  // ---------------------------------------------------------------------------

  private transition(to: State): void {
    this.state = to;
  }

  private get isConnected(): boolean {
    return this.state === 'streaming';
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
      this.transition('build:loading');
      await this.initializeForBuildStep();
      this.transition('build:ready');
      return;
    }

    // Hydrate from provided datafile if not already set (e.g., after shutdown)
    if (!this.data && this.options.datafile) {
      this.data = tagData(this.options.datafile, 'provided');
    }

    // If we already have data (from provided datafile), start background updates
    // but don't block on them
    if (this.data) {
      this.startBackgroundUpdates();
      return;
    }

    // Fallback chain
    if (this.options.stream.enabled) {
      this.transition('initializing:stream');
      const streamSuccess = await this.tryInitializeStream();
      if (streamSuccess) {
        this.transition('streaming');
        return;
      }
    }

    if (this.options.polling.enabled) {
      this.transition('initializing:polling');
      const pollingSuccess = await this.tryInitializePolling();
      if (pollingSuccess) {
        this.transition('polling');
        return;
      }
    }

    this.transition('initializing:fallback');

    // Fall back to provided datafile (already set in constructor if provided)
    if (this.data) {
      this.transition('degraded');
      return;
    }

    // Fall back to bundled definitions
    await this.initializeFromBundled();
    this.transition('degraded');
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

    let result: TaggedData;
    let cacheStatus: Metrics['cacheStatus'];

    if (this.options.buildStep) {
      [result, cacheStatus] = await this.getDataForBuildStep();
    } else if (cachedData) {
      [result, cacheStatus] = this.getDataFromCache(cachedData);
    } else {
      [result, cacheStatus] = await this.getDataWithFallbacks();
    }

    const readMs = Date.now() - startTime;
    const source = originToMetricsSource(result._origin);
    this.trackRead(startTime, cacheHadDefinitions, isFirstRead, source);

    return Object.assign(result, {
      metrics: {
        readMs,
        source,
        cacheStatus,
        connectionState: this.isConnected
          ? ('connected' as const)
          : ('disconnected' as const),
      },
    }) satisfies Datafile;
  }

  /**
   * Shuts down the data source and releases resources.
   */
  async shutdown(): Promise<void> {
    this.streamSource.stop();
    this.pollingSource.stop();
    this.data = this.options.datafile
      ? tagData(this.options.datafile, 'provided')
      : undefined;
    this.transition('shutdown');
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

    let result: TaggedData;
    let source: Metrics['source'];
    let cacheStatus: Metrics['cacheStatus'];

    if (this.options.buildStep) {
      [result, cacheStatus] = await this.getDataForBuildStep();
      source = originToMetricsSource(result._origin);
    } else if (this.isConnected && this.data) {
      [result, cacheStatus] = this.getDataFromCache();
      source = originToMetricsSource(result._origin);
    } else {
      const fetched = await fetchDatafile(
        this.host,
        this.options.sdkKey,
        this.options.fetch,
      );
      const tagged = tagData(fetched, 'fetched');
      if (this.isNewerData(tagged)) {
        this.data = tagged;
      }
      result = this.data ?? tagged;
      source = 'remote';
      cacheStatus = 'MISS';
    }

    return Object.assign(result, {
      metrics: {
        readMs: Date.now() - startTime,
        source,
        cacheStatus,
        connectionState: this.isConnected
          ? ('connected' as const)
          : ('disconnected' as const),
      },
    }) satisfies Datafile;
  }

  /**
   * Returns the bundled fallback datafile.
   */
  async getFallbackDatafile(): Promise<BundledDefinitions> {
    return this.bundledSource.getRaw();
  }

  // ---------------------------------------------------------------------------
  // Stream initialization
  // ---------------------------------------------------------------------------

  /**
   * Attempts to initialize via stream with timeout.
   * Returns true if stream connected successfully within timeout.
   */
  private async tryInitializeStream(): Promise<boolean> {
    if (this.options.stream.initTimeoutMs <= 0) {
      try {
        await this.streamSource.start();
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
      const result = await Promise.race([
        this.streamSource.start(),
        timeoutPromise,
      ]);
      clearTimeout(timeoutId!);

      if (result === 'timeout') {
        console.warn(
          '@vercel/flags-core: Stream initialization timeout, falling back',
        );
        // Don't stop stream - let it continue trying in background
        return false;
      }

      return true;
    } catch {
      clearTimeout(timeoutId!);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Polling initialization
  // ---------------------------------------------------------------------------

  /**
   * Attempts to initialize via polling with timeout.
   * Returns true if first poll succeeded within timeout.
   */
  private async tryInitializePolling(): Promise<boolean> {
    const pollPromise = this.pollingSource.poll();

    if (this.options.polling.initTimeoutMs <= 0) {
      try {
        await pollPromise;
        if (this.data) {
          this.pollingSource.startInterval();
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
        this.pollingSource.startInterval();
        return true;
      }
      return false;
    } catch {
      clearTimeout(timeoutId!);
      return false;
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
      void this.streamSource.start();
      this.transition('streaming');
    } else if (this.options.polling.enabled) {
      this.pollingSource.startInterval();
      this.transition('polling');
    } else {
      this.transition('degraded');
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

    const bundled = await this.bundledSource.tryLoad();
    if (bundled) {
      this.data = bundled;
      return;
    }

    const fetched = await fetchDatafile(
      this.host,
      this.options.sdkKey,
      this.options.fetch,
    );
    this.data = tagData(fetched, 'fetched');
  }

  /**
   * Retrieves data during build steps.
   */
  private async getDataForBuildStep(): Promise<
    [TaggedData, Metrics['cacheStatus']]
  > {
    if (this.data) {
      return [this.data, 'HIT'];
    }

    const bundled = await this.bundledSource.tryLoad();
    if (bundled) {
      this.data = bundled;
      return [this.data, 'MISS'];
    }

    const fetched = await fetchDatafile(
      this.host,
      this.options.sdkKey,
      this.options.fetch,
    );
    this.data = tagData(fetched, 'fetched');
    return [this.data, 'MISS'];
  }

  // ---------------------------------------------------------------------------
  // Runtime helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns data from the in-memory cache.
   */
  private getDataFromCache(
    cachedData?: TaggedData,
  ): [TaggedData, Metrics['cacheStatus']] {
    const data = cachedData ?? this.data!;
    this.warnIfDisconnected();
    const cacheStatus = this.isConnected ? 'HIT' : 'STALE';
    return [data, cacheStatus];
  }

  /**
   * Retrieves data using the fallback chain.
   */
  private async getDataWithFallbacks(): Promise<
    [TaggedData, Metrics['cacheStatus']]
  > {
    // Try stream with timeout
    if (this.options.stream.enabled) {
      this.transition('initializing:stream');
      const streamSuccess = await this.tryInitializeStream();
      if (streamSuccess && this.data) {
        this.transition('streaming');
        return [this.data, 'MISS'];
      }
    }

    // Try polling with timeout
    if (this.options.polling.enabled) {
      this.transition('initializing:polling');
      const pollingSuccess = await this.tryInitializePolling();
      if (pollingSuccess && this.data) {
        this.transition('polling');
        return [this.data, 'MISS'];
      }
    }

    this.transition('initializing:fallback');

    // Use provided datafile
    if (this.options.datafile) {
      this.data = tagData(this.options.datafile, 'provided');
      this.transition('degraded');
      return [this.data, 'STALE'];
    }

    // Use bundled definitions
    const bundled = await this.bundledSource.tryLoad();
    if (bundled) {
      console.warn('@vercel/flags-core: Using bundled definitions as fallback');
      this.data = bundled;
      this.transition('degraded');
      return [this.data, 'STALE'];
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
    const bundled = await this.bundledSource.tryLoad();
    if (bundled) {
      this.data = bundled;
      return;
    }

    throw new Error(
      '@vercel/flags-core: No flag definitions available. ' +
        'Bundled definitions not found.',
    );
  }

  // ---------------------------------------------------------------------------
  // Data comparison
  // ---------------------------------------------------------------------------

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

    const currentTs = parseConfigUpdatedAt(this.data.configUpdatedAt);
    const incomingTs = parseConfigUpdatedAt(incoming.configUpdatedAt);

    if (currentTs === undefined || incomingTs === undefined) {
      return true;
    }

    return incomingTs >= currentTs;
  }

  /**
   * Logs a warning if returning cached data while stream is disconnected.
   */
  private warnIfDisconnected(): void {
    if (!this.isConnected && !this.hasWarnedAboutStaleData) {
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
