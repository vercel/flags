import type {
  BundledDefinitions,
  ControllerInterface,
  Datafile,
  DatafileInput,
  Metrics,
} from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import { type TrackReadOptions, UsageTracker } from '../utils/usage-tracker';
import { BundledSource } from './bundled-source';
import { fetchDatafile } from './fetch-datafile';
import {
  type ControllerOptions,
  type NormalizedOptions,
  normalizeOptions,
} from './normalized-options';
import { PollingSource } from './polling-source';
import { UnauthorizedError } from './stream-connection';
import { StreamSource } from './stream-source';
import { originToMetricsSource, type TaggedData, tagData } from './tagged-data';

export { BundledSource } from './bundled-source';
export type { ControllerOptions } from './normalized-options';
export { PollingSource } from './polling-source';
export { StreamSource } from './stream-source';

// ---------------------------------------------------------------------------
// Internal helpers
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
// Internal types
// ---------------------------------------------------------------------------

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
 * - No streaming, polling, or fetching
 *
 * **Runtime — streaming mode** (stream enabled):
 * - Uses streaming exclusively
 * - Fallback: last known value → constructor datafile → bundled → defaultValue → throw
 * - Polling is never started, even if configured
 *
 * **Runtime — polling mode** (polling enabled, stream disabled):
 * - Uses polling exclusively
 * - Same fallback chain
 *
 * **Runtime — offline mode** (neither stream nor polling):
 * - Uses constructor datafile → bundled → one-time fetch → defaultValue → throw
 */
export class Controller implements ControllerInterface {
  private options: NormalizedOptions;

  // State machine
  private state: State = 'idle';

  // Data state — tagged with origin
  private data: TaggedData | undefined;

  // Sources (I/O delegates)
  private streamSource: StreamSource;
  private pollingSource: PollingSource;
  private bundledSource: BundledSource;

  // Usage tracking
  private usageTracker: UsageTracker;
  private isFirstGetData: boolean = true;

  // Build-step deduplication
  private buildDataPromise: Promise<TaggedData> | null = null;
  private buildReadTracked = false;

  // Suppresses usage tracking when the SDK key is unauthorized
  private unauthorized = false;

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
      options.sources?.stream ?? new StreamSource(this.options);

    this.pollingSource =
      options.sources?.polling ?? new PollingSource(this.options);

    this.bundledSource =
      options.sources?.bundled ??
      new BundledSource({
        sdkKey: this.options.sdkKey,
        readBundledDefinitions,
      });

    // Wire source events to state machine
    this.wireSourceEvents();

    // If datafile provided, use it immediately
    if (this.options.datafile) {
      this.data = tagData(this.options.datafile, 'provided');
    }

    this.usageTracker = new UsageTracker(this.options);
  }

  // Source event handlers (stored for cleanup)
  private onStreamData = (data: DatafileInput) => {
    if (this.isNewerData(data)) {
      this.data = tagData(data, 'stream');
    }
  };
  private onStreamConnected = () => {
    if (this.state === 'degraded' || this.state === 'initializing:stream') {
      this.transition('streaming');
    }
  };
  private onStreamDisconnected = () => {
    if (this.state === 'streaming') {
      this.transition('degraded');
    }
  };
  private onPollData = (data: DatafileInput) => {
    if (this.isNewerData(data)) {
      this.data = tagData(data, 'poll');
    }
  };
  private onPollError = (error: Error) => {
    console.error('@vercel/flags-core: Poll failed:', error);
  };

  // ---------------------------------------------------------------------------
  // Source event wiring
  // ---------------------------------------------------------------------------

  private wireSourceEvents(): void {
    this.streamSource.on('data', this.onStreamData);
    this.streamSource.on('connected', this.onStreamConnected);
    this.streamSource.on('disconnected', this.onStreamDisconnected);
    this.pollingSource.on('data', this.onPollData);
    this.pollingSource.on('error', this.onPollError);
  }

  private unwireSourceEvents(): void {
    this.streamSource.off('data', this.onStreamData);
    this.streamSource.off('connected', this.onStreamConnected);
    this.streamSource.off('disconnected', this.onStreamDisconnected);
    this.pollingSource.off('data', this.onPollData);
    this.pollingSource.off('error', this.onPollError);
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

  private get mode(): Metrics['mode'] {
    if (this.options.buildStep) return 'build';
    switch (this.state) {
      case 'streaming':
        return 'streaming';
      case 'polling':
        return 'polling';
      default:
        return 'offline';
    }
  }

  // ---------------------------------------------------------------------------
  // Public API (DataSource interface)
  // ---------------------------------------------------------------------------

  /**
   * Initializes the data source.
   *
   * Build step: datafile → bundled (no network)
   * Streaming mode: stream → datafile → bundled
   * Polling mode (no stream): poll → datafile → bundled
   * Offline mode (neither): datafile → bundled → one-time fetch
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

    // Try the configured primary source (stream or poll, never both)
    if (this.options.stream.enabled) {
      this.transition('initializing:stream');
      const streamSuccess = await this.tryInitializeStream();
      if (streamSuccess) {
        this.transition('streaming');
        return;
      }
    } else if (this.options.polling.enabled) {
      this.transition('initializing:polling');
      const pollingSuccess = await this.tryInitializePolling();
      if (pollingSuccess) {
        this.transition('polling');
        return;
      }
    }

    // Fallback chain: datafile → bundled → one-time fetch (offline only)
    await this.initializeFromFallbacks();
  }

  /**
   * Reads the current datafile with metrics.
   */
  async read(): Promise<Datafile> {
    const startTime = Date.now();
    const cacheHadDefinitions = this.data !== undefined;
    const isFirstRead = this.isFirstGetData;
    this.isFirstGetData = false;

    const [result, cacheStatus] = await this.resolveData();

    const readMs = Date.now() - startTime;
    const source = originToMetricsSource(result._origin);
    this.trackRead(startTime, cacheHadDefinitions, isFirstRead, source);

    return {
      ...result,
      metrics: {
        readMs,
        source,
        cacheStatus,
        connectionState: this.isConnected
          ? ('connected' as const)
          : ('disconnected' as const),
        mode: this.mode,
      },
    } satisfies Datafile;
  }

  /**
   * Shuts down the data source and releases resources.
   */
  async shutdown(): Promise<void> {
    this.unwireSourceEvents();
    this.streamSource.stop();
    this.pollingSource.stop();
    this.data = this.options.datafile
      ? tagData(this.options.datafile, 'provided')
      : undefined;
    this.transition('shutdown');
    await this.usageTracker.flush();
  }

  /**
   * Returns the datafile with metrics.
   * Uses in-memory data if available, otherwise falls back to bundled,
   * then to a one-time fetch if called without prior initialization.
   */
  async getDatafile(): Promise<Datafile> {
    const startTime = Date.now();
    this.isFirstGetData = false;

    let result: TaggedData;
    let cacheStatus: Metrics['cacheStatus'];

    if (this.options.buildStep) {
      [result, cacheStatus] = await this.resolveDataForBuildStep();
    } else if (this.data) {
      cacheStatus = this.isConnected ? 'HIT' : 'STALE';
      result = this.data;
    } else {
      // No in-memory data — try bundled, then one-time fetch
      const bundled = await this.bundledSource.tryLoad();
      if (bundled) {
        this.data = tagData(bundled, 'bundled');
        result = this.data;
        cacheStatus = 'MISS';
      } else {
        // One-time fetch as last resort
        try {
          const fetched = await fetchDatafile({
            host: this.options.host,
            sdkKey: this.options.sdkKey,
            fetch: this.options.fetch,
          });
          this.data = tagData(fetched, 'fetched');
          result = this.data;
          cacheStatus = 'MISS';
        } catch {
          throw new Error(
            '@vercel/flags-core: No flag definitions available. ' +
              'Initialize the client or provide a datafile.',
          );
        }
      }
    }

    const source = originToMetricsSource(result._origin);

    return {
      ...result,
      metrics: {
        readMs: Date.now() - startTime,
        source,
        cacheStatus,
        connectionState: this.isConnected
          ? ('connected' as const)
          : ('disconnected' as const),
        mode: this.mode,
      },
    } satisfies Datafile;
  }

  /**
   * Returns the bundled fallback datafile.
   */
  async getFallbackDatafile(): Promise<BundledDefinitions> {
    return this.bundledSource.getRaw();
  }

  // ---------------------------------------------------------------------------
  // Data resolution (shared by read() and getDatafile())
  // ---------------------------------------------------------------------------

  /**
   * Resolves the current data, using the appropriate strategy for the
   * current mode. Returns tagged data and cache status.
   *
   * Build step: cached → bundled (no network)
   * Runtime with cache: return cached data
   * Runtime without cache: stream/poll → datafile → bundled → fetch → throw
   */
  private async resolveData(): Promise<[TaggedData, Metrics['cacheStatus']]> {
    if (this.options.buildStep) {
      return this.resolveDataForBuildStep();
    }

    if (this.data) {
      const cacheStatus = this.isConnected ? 'HIT' : 'STALE';
      return [this.data, cacheStatus];
    }

    return this.resolveDataWithFallbacks();
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
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          this.unauthorized = true;
        }
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
        // Don't stop stream - let it continue trying in background.
        // Swallow the rejection from the background stream promise to
        // avoid unhandled promise rejections when it is eventually aborted.
        this.streamSource.start().catch(() => {});
        return false;
      }

      return true;
    } catch (error) {
      clearTimeout(timeoutId!);
      if (error instanceof Error && error.message.includes('401')) {
        this.unauthorized = true;
      }
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Polling initialization
  // ---------------------------------------------------------------------------

  /**
   * Attempts to initialize via polling with timeout.
   * Returns true if first poll succeeded within timeout.
   *
   * Only used when streaming is disabled and polling is the primary source.
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
      this.transition('initializing:stream');
      this.streamSource.start().catch(() => {});
    } else if (this.options.polling.enabled) {
      // Start interval first so the abort controller exists for the initial poll
      this.pollingSource.startInterval();
      void this.pollingSource.poll();
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

    if (!this.buildDataPromise) {
      this.buildDataPromise = this.loadBuildData();
    }
    this.data = await this.buildDataPromise;
  }

  /**
   * Retrieves data during build steps.
   * Concurrent callers share a single load promise. The first caller to
   * populate `this.data` gets cacheStatus MISS; subsequent callers get HIT.
   */
  private async resolveDataForBuildStep(): Promise<
    [TaggedData, Metrics['cacheStatus']]
  > {
    if (this.data) {
      return [this.data, 'HIT'];
    }

    if (!this.buildDataPromise) {
      this.buildDataPromise = this.loadBuildData();
    }

    const data = await this.buildDataPromise;

    if (!this.data) {
      this.data = data;
      return [data, 'MISS'];
    }
    return [this.data, 'HIT'];
  }

  /**
   * Loads data for a build step: bundled → one-time fetch.
   */
  private async loadBuildData(): Promise<TaggedData> {
    const bundled = await this.bundledSource.tryLoad();
    if (bundled) return tagData(bundled, 'bundled');

    // Fallback: one-time fetch
    try {
      const fetched = await fetchDatafile({
        host: this.options.host,
        sdkKey: this.options.sdkKey,
        fetch: this.options.fetch,
      });
      return tagData(fetched, 'fetched');
    } catch {
      // fetch failed — fall through to throw
    }

    throw new Error(
      '@vercel/flags-core: No flag definitions available during build. ' +
        'Provide a datafile or bundled definitions.',
    );
  }

  // ---------------------------------------------------------------------------
  // Fallback helpers
  // ---------------------------------------------------------------------------

  /**
   * Shared fallback chain used by both initialize() and resolveData().
   */
  private async initializeFromFallbacks(): Promise<void> {
    this.transition('initializing:fallback');

    if (this.data) {
      this.transition('degraded');
      return;
    }

    const bundled = await this.bundledSource.tryLoad();
    if (bundled) {
      this.data = tagData(bundled, 'bundled');
      this.transition('degraded');
      return;
    }

    // Last resort: one-time fetch (only when no stream/poll configured)
    if (!this.options.stream.enabled && !this.options.polling.enabled) {
      try {
        const fetched = await fetchDatafile({
          host: this.options.host,
          sdkKey: this.options.sdkKey,
          fetch: this.options.fetch,
        });
        this.data = tagData(fetched, 'fetched');
        this.transition('degraded');
        return;
      } catch {
        // fetch failed — fall through to throw
      }
    }

    throw new Error(
      '@vercel/flags-core: No flag definitions available. ' +
        'Bundled definitions not found.',
    );
  }

  /**
   * Retrieves data using the fallback chain (called when no cached data exists).
   * Streaming mode: stream → datafile → bundled.
   * Polling mode: poll → datafile → bundled.
   * Offline mode: datafile → bundled → one-time fetch.
   */
  private async resolveDataWithFallbacks(): Promise<
    [TaggedData, Metrics['cacheStatus']]
  > {
    // Try the configured primary source
    if (this.options.stream.enabled) {
      this.transition('initializing:stream');
      const streamSuccess = await this.tryInitializeStream();
      if (streamSuccess && this.data) {
        this.transition('streaming');
        return [this.data, 'MISS'];
      }
    } else if (this.options.polling.enabled) {
      this.transition('initializing:polling');
      const pollingSuccess = await this.tryInitializePolling();
      if (pollingSuccess && this.data) {
        this.transition('polling');
        return [this.data, 'MISS'];
      }
    }

    // Fallback chain: datafile → bundled → one-time fetch
    this.transition('initializing:fallback');

    if (this.options.datafile) {
      this.data = tagData(this.options.datafile, 'provided');
      this.transition('degraded');
      return [this.data, 'STALE'];
    }

    const bundled = await this.bundledSource.tryLoad();
    if (bundled) {
      console.warn('@vercel/flags-core: Using bundled definitions as fallback');
      this.data = tagData(bundled, 'bundled');
      this.transition('degraded');
      return [this.data, 'STALE'];
    }

    // Last resort: one-time fetch (only when no stream/poll configured)
    if (!this.options.stream.enabled && !this.options.polling.enabled) {
      try {
        const fetched = await fetchDatafile({
          host: this.options.host,
          sdkKey: this.options.sdkKey,
          fetch: this.options.fetch,
        });
        this.data = tagData(fetched, 'fetched');
        this.transition('degraded');
        return [this.data, 'MISS'];
      } catch {
        // fetch failed — fall through to throw
      }
    }

    throw new Error(
      '@vercel/flags-core: No flag definitions available. ' +
        'Provide a datafile or bundled definitions.',
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
   * Skips the update only when both have configUpdatedAt and incoming is not newer.
   */
  private isNewerData(incoming: DatafileInput): boolean {
    if (!this.data) return true;

    const currentTs = parseConfigUpdatedAt(this.data.configUpdatedAt);
    const incomingTs = parseConfigUpdatedAt(incoming.configUpdatedAt);

    if (currentTs === undefined || incomingTs === undefined) {
      return true;
    }

    return incomingTs > currentTs;
  }

  // ---------------------------------------------------------------------------
  // Usage tracking
  // ---------------------------------------------------------------------------

  /**
   * Tracks a read operation for usage analytics.
   * During build steps, only the first read is tracked.
   */
  private trackRead(
    startTime: number,
    cacheHadDefinitions: boolean,
    isFirstRead: boolean,
    source: Metrics['source'],
  ): void {
    if (this.unauthorized) return;
    if (this.options.buildStep && this.buildReadTracked) return;
    if (this.options.buildStep) this.buildReadTracked = true;

    const configOrigin: 'in-memory' | 'embedded' =
      source === 'embedded' ? 'embedded' : 'in-memory';
    const cacheAction: 'FOLLOWING' | 'REFRESHING' | 'NONE' =
      this.state === 'streaming'
        ? 'FOLLOWING'
        : this.state === 'polling'
          ? 'REFRESHING'
          : 'NONE';
    const trackOptions: TrackReadOptions = {
      configOrigin,
      cacheStatus: cacheHadDefinitions ? 'HIT' : 'MISS',
      cacheAction,
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
