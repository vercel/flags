import type {
  BundledDefinitions,
  ControllerInterface,
  Datafile,
  DatafileInput,
  Metrics,
} from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import type { TrackReadOptions } from '../utils/usage/flags-config-read';
import type { TrackEvaluationOptions } from '../utils/usage/flags-evaluation';
import { UsageTracker } from '../utils/usage-tracker';
import { BundledSource } from './bundled-source';
import {
  type CacheMetadata,
  type CacheReadPolicy,
  DatafileCache,
} from './datafile-cache';
import { fetchDatafile } from './fetch-datafile';
import { HeaderSource } from './header-source';
import {
  type ControllerOptions,
  type NormalizedOptions,
  normalizeOptions,
} from './normalized-options';
import { PollingSource } from './polling-source';
import { type PrimedMessage, UnauthorizedError } from './stream-connection';
import { StreamSource } from './stream-source';
import { originToMetricsSource, type TaggedData, tagData } from './tagged-data';

export { BundledSource } from './bundled-source';
export type { ControllerOptions } from './normalized-options';
export { PollingSource } from './polling-source';
export { StreamSource } from './stream-source';

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
  | 'vercel'
  | 'degraded'
  | 'build:loading'
  | 'build:ready'
  | 'shutdown';

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * Connects to flags.vercel.com and manages flag definitions.
 *
 * Implemented as a state machine controller that delegates all I/O to
 * source modules (StreamSource, PollingSource, BundledSource).
 *
 * **Build step** (CI=1 or Next.js build, or buildStep: true):
 * - Uses datafile (if provided), bundled definitions, or one-time fetch as fallback
 * - No streaming or polling
 *
 * **Runtime — streaming mode** (stream enabled):
 * - Uses streaming exclusively; polling is never started, even if configured
 * - Init fallback (no data yet): constructor datafile → bundled → throw
 * - Read fallback (post-init): in-memory value → constructor datafile → bundled → throw
 *
 * **Runtime — polling mode** (polling enabled, stream disabled):
 * - Uses polling exclusively
 * - Same fallback chains as streaming mode
 *
 * **Runtime — Vercel mode** (vercel enabled, with stream or polling enabled):
 * - Loads provided/bundled data before selecting the mode; no startup network
 * - HeaderSource checks request versions and refreshes when needed
 * - Cache applies version acceptance and stale-if-error to all served data
 *
 * **Runtime — offline mode** (neither stream nor polling):
 * - Init fallback: constructor datafile → bundled → one-time fetch → throw
 * - Read fallback: in-memory value → constructor datafile → bundled → one-time fetch → throw
 */
export class Controller implements ControllerInterface {
  private options: NormalizedOptions;

  // State machine
  private state: State = 'idle';

  // Data state — tagged with origin
  private readonly cache: DatafileCache;

  // Memoized data spread for read() / getDatafile().
  // Rebuilt only when the cached data reference changes (e.g. on stream/poll update).
  // Holds the result of stripping `_origin`; metrics are appended per-call.
  private dataViewSource: TaggedData | undefined = undefined;
  private dataViewBase: DatafileInput | undefined = undefined;

  // Sources (I/O delegates)
  private streamSource: StreamSource;
  private pollingSource: PollingSource;
  private bundledSource: BundledSource;
  private headerSource: HeaderSource;

  // Usage tracking
  private usageTracker: UsageTracker;
  private isFirstGetData: boolean = true;

  // Build-step deduplication
  private buildDataPromise: Promise<TaggedData> | null = null;
  private buildReadTracked = false;

  // Suppresses usage tracking when the SDK key is unauthorized
  private unauthorized = false;

  constructor(options: ControllerOptions) {
    this.options = normalizeOptions(options);
    this.cache = new DatafileCache(
      this.options.staleIfErrorMs,
      this.options.waitUntil,
    );

    // Create source modules
    this.streamSource = new StreamSource(
      this.options,
      () => this.cache.revision,
    );

    this.pollingSource = new PollingSource(this.options);
    this.headerSource = new HeaderSource(this.options);

    this.bundledSource = new BundledSource({
      auth: this.options.auth,
      readBundledDefinitions,
    });

    // Wire source events to state machine
    this.wireSourceEvents();

    // If datafile provided, use it immediately
    if (this.options.datafile) {
      this.cache.seed(tagData(this.options.datafile, 'provided'));
    }

    this.usageTracker = new UsageTracker(this.options);
  }

  // Source event handlers (stored for cleanup)
  private onStreamData = (data: DatafileInput) => {
    this.cache.updateFromSource(data, 'stream');
  };
  private onStreamPrimed = (message: PrimedMessage) => {
    this.cache.tryConfirm(message, 'revision');
    // The server confirmed our revision is current — no new data needed.
    // Transition to streaming like a normal connected event.
    if (this.state === 'degraded' || this.state === 'initializing:stream') {
      this.transition('streaming');
    }
  };
  private onStreamPing = () => {
    this.cache.resetAge();
  };
  private onStreamConnected = () => {
    if (this.state === 'degraded' || this.state === 'initializing:stream') {
      this.transition('streaming');
    }
  };
  private onStreamDisconnected = () => {
    this.cache.fail(new Error('stream: disconnected'));
    if (this.state === 'streaming') {
      this.transition('degraded');
    }
  };
  private onSourceError = (error: Error) => {
    this.cache.fail(error);
  };
  private onPollData = (data: DatafileInput) => {
    this.cache.updateFromSource(data, 'poll');
  };
  private onHeaderData = (data: DatafileInput) => {
    this.cache.updateFromSource(data, 'fetched');
  };
  private onHeaderConfirmed = (data: CacheMetadata) => {
    this.cache.tryConfirm(data);
  };

  // ---------------------------------------------------------------------------
  // Source event wiring
  // ---------------------------------------------------------------------------

  private wireSourceEvents(): void {
    this.streamSource.on('data', this.onStreamData);
    this.streamSource.on('primed', this.onStreamPrimed);
    this.streamSource.on('ping', this.onStreamPing);
    this.streamSource.on('connected', this.onStreamConnected);
    this.streamSource.on('disconnected', this.onStreamDisconnected);
    this.streamSource.on('error', this.onSourceError);
    this.pollingSource.on('data', this.onPollData);
    this.pollingSource.on('error', this.onSourceError);
    this.headerSource.on('data', this.onHeaderData);
    this.headerSource.on('confirmed', this.onHeaderConfirmed);
  }

  private unwireSourceEvents(): void {
    this.streamSource.off('data', this.onStreamData);
    this.streamSource.off('primed', this.onStreamPrimed);
    this.streamSource.off('ping', this.onStreamPing);
    this.streamSource.off('connected', this.onStreamConnected);
    this.streamSource.off('disconnected', this.onStreamDisconnected);
    this.streamSource.off('error', this.onSourceError);
    this.pollingSource.off('data', this.onPollData);
    this.pollingSource.off('error', this.onSourceError);
    this.headerSource.off('data', this.onHeaderData);
    this.headerSource.off('confirmed', this.onHeaderConfirmed);
  }

  // ---------------------------------------------------------------------------
  // State machine
  // ---------------------------------------------------------------------------

  private transition(to: State): void {
    this.state = to;
  }

  private get mode(): Metrics['mode'] {
    if (this.options.buildStep) return 'build';
    switch (this.state) {
      case 'streaming':
        return 'streaming';
      case 'polling':
        return 'polling';
      case 'vercel':
        return 'vercel';
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
   * Build step: datafile → bundled → one-time fetch
   * Streaming mode: stream → datafile → bundled
   * Polling mode (no stream): poll → datafile → bundled
   * Vercel mode: datafile → bundled; fetch only on a read
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
    if (!this.cache.hasData && this.options.datafile) {
      this.cache.seed(tagData(this.options.datafile, 'provided'));
    }

    // If no data yet, try loading bundled definitions eagerly so we can
    // send the revision to the stream and potentially get a lightweight
    // "primed" response instead of a full datafile.
    if (!this.cache.hasData) {
      try {
        const bundled = await this.bundledSource.tryLoad();
        if (bundled) this.cache.seed(tagData(bundled, 'bundled'));
      } catch {
        // Bundled definitions not available — proceed without revision
      }
    }

    if (this.headerSource.isAvailable()) {
      this.transition('vercel');
      return;
    }

    // If we already have data (from provided datafile or bundled definitions),
    // start updates. Both streaming and polling wait for initial data before
    // being considered initialized, so we know we have fresh data.
    // For no-updates (offline), return immediately since we already have usable data.
    if (this.cache.hasData) {
      if (this.options.stream.enabled) {
        this.transition('initializing:stream');
        await this.tryInitializeStream();
      } else if (this.options.polling.enabled) {
        this.transition('initializing:polling');
        await this.tryInitializePolling();
      } else {
        this.transition('degraded');
      }
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
    const cacheHadDefinitions = this.cache.hasData;
    const isFirstRead = this.isFirstGetData;
    this.isFirstGetData = false;

    const [result, cacheStatus] = await this.resolveData();

    if (this.dataViewSource !== result) {
      const { _origin, ...rest } = result;
      this.dataViewBase = rest;
      this.dataViewSource = result;
    }

    const datafile = {
      ...(this.dataViewBase as DatafileInput),
      metrics: {
        readMs: Date.now() - startTime,
        source: originToMetricsSource(result._origin),
        cacheStatus,
        connectionState:
          this.state === 'streaming'
            ? ('connected' as const)
            : ('disconnected' as const),
        mode: this.mode,
      },
    } satisfies Datafile;

    this.trackRead(startTime, cacheHadDefinitions, isFirstRead, datafile);
    return datafile;
  }

  /**
   * Shuts down the data source and releases resources.
   */
  async shutdown(): Promise<void> {
    this.unwireSourceEvents();
    this.streamSource.stop();
    this.pollingSource.stop();
    this.headerSource.stop();
    this.cache.clear();
    if (this.options.datafile) {
      this.cache.seed(tagData(this.options.datafile, 'provided'));
    }
    this.transition('shutdown');
    await this.usageTracker.shutdown();
  }

  /**
   * Returns the datafile with metrics.
   * Uses in-memory data if available, otherwise falls back to bundled,
   * then to a one-time fetch if called without prior initialization.
   */
  async getDatafile(): Promise<Datafile> {
    const startTime = Date.now();
    this.isFirstGetData = false;

    let result = this.cache.read();
    let cacheStatus: Metrics['cacheStatus'];

    if (this.options.buildStep) {
      [result, cacheStatus] = await this.resolveDataForBuildStep();
    } else if (result) {
      const metadata = this.cache.metadata;
      // Snapshots must not turn request headers into freshness evidence.
      const status =
        metadata && this.state !== 'vercel'
          ? this.cacheReadPolicy.getStatus(metadata)
          : 'unknown';

      cacheStatus = status === 'fresh' ? 'HIT' : 'STALE';
    } else {
      // Preserve snapshot loading without starting stream/poll initialization.
      const bundled = await this.bundledSource.tryLoad();
      if (bundled) {
        this.cache.seed(tagData(bundled, 'bundled'));
      } else {
        try {
          const fetched = await fetchDatafile({
            host: this.options.host,
            auth: this.options.auth,
            fetch: this.options.fetch,
          });
          this.cache.seed(tagData(fetched, 'fetched'));
        } catch {
          throw new Error(
            '@vercel/flags-core: No flag definitions available. ' +
              'Initialize the client or provide a datafile.',
          );
        }
      }
      cacheStatus = 'MISS';
      result = this.cache.read()!;
    }

    if (this.dataViewSource !== result) {
      const { _origin, ...rest } = result;
      this.dataViewBase = rest;
      this.dataViewSource = result;
    }

    return {
      ...(this.dataViewBase as DatafileInput),
      metrics: {
        readMs: Date.now() - startTime,
        source: originToMetricsSource(result._origin),
        cacheStatus,
        connectionState:
          this.state === 'streaming'
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
   * Build step: cached → bundled → one-time fetch
   * Runtime with cache: return cached data
   * Runtime without cache: stream/poll → datafile → bundled → fetch → throw
   */
  private async resolveData(): Promise<[TaggedData, Metrics['cacheStatus']]> {
    if (this.options.buildStep) {
      return this.resolveDataForBuildStep();
    }

    const result = await this.cache.resolve(this.cacheReadPolicy);
    if (result) return result;

    return this.resolveDataWithFallbacks();
  }

  private get cacheReadPolicy(): CacheReadPolicy {
    if (this.state === 'vercel') {
      return {
        getStatus: this.headerSource.getStatusCheck(),
        fetch: this.headerSource.fetch,
      };
    }

    if (this.state === 'streaming') {
      return { getStatus: this.streamSource.getStatus };
    }

    if (this.state === 'polling' || this.state === 'initializing:polling') {
      return { getStatus: this.pollingSource.getStatus };
    }

    return { getStatus: () => 'unknown' };
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
          '@vercel/flags-core: Stream initialization timeout, falling back while continuing to connect in the background',
        );
        // Don't stop stream - let it continue trying in background.
        // Swallow the rejection from the background stream promise to
        // avoid unhandled promise rejections when it is eventually aborted.
        void this.streamSource.start().catch(() => {});
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
        if (this.cache.hasData) {
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
          '@vercel/flags-core: Polling initialization timeout, falling back while continuing to poll in the background',
        );
        return false;
      }

      if (this.cache.hasData) {
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
  // Build step helpers
  // ---------------------------------------------------------------------------

  /**
   * Initializes data for build step environments.
   */
  private async initializeForBuildStep(): Promise<void> {
    if (this.cache.hasData) return;

    if (!this.buildDataPromise) {
      this.buildDataPromise = this.loadBuildData();
    }
    this.cache.seed(await this.buildDataPromise);
  }

  /**
   * Retrieves data during build steps.
   * Concurrent callers share a single load promise. The first caller to
   * populate the cache gets cacheStatus MISS; subsequent callers get HIT.
   */
  private async resolveDataForBuildStep(): Promise<
    [TaggedData, Metrics['cacheStatus']]
  > {
    const cached = this.cache.read();
    if (cached) {
      return [cached, 'HIT'];
    }

    if (!this.buildDataPromise) {
      this.buildDataPromise = this.loadBuildData();
    }

    const data = await this.buildDataPromise;

    if (!this.cache.hasData) {
      this.cache.seed(data);
      return [this.cache.read()!, 'MISS'];
    }
    return [this.cache.read()!, 'HIT'];
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
        auth: this.options.auth,
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

    if (this.cache.hasData) {
      this.transition('degraded');
      return;
    }

    const bundled = await this.bundledSource.tryLoad();
    if (bundled) {
      this.cache.seed(tagData(bundled, 'bundled'));
      this.transition('degraded');
      return;
    }

    // Last resort: one-time fetch (only when no stream/poll configured)
    if (!this.options.stream.enabled && !this.options.polling.enabled) {
      try {
        const fetched = await fetchDatafile({
          host: this.options.host,
          auth: this.options.auth,
          fetch: this.options.fetch,
        });
        this.cache.seed(tagData(fetched, 'fetched'));
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
      if (streamSuccess && this.cache.hasData) {
        this.transition('streaming');
        return [this.cache.read()!, 'MISS'];
      }
    } else if (this.options.polling.enabled) {
      this.transition('initializing:polling');
      const pollingSuccess = await this.tryInitializePolling();
      if (pollingSuccess && this.cache.hasData) {
        this.transition('polling');
        return [this.cache.read()!, 'MISS'];
      }
    }

    // Fallback chain: datafile → bundled → one-time fetch
    this.transition('initializing:fallback');

    if (this.options.datafile) {
      this.cache.seed(tagData(this.options.datafile, 'provided'));
      this.transition('degraded');
      return [this.cache.read()!, 'STALE'];
    }

    const bundled = await this.bundledSource.tryLoad();
    if (bundled) {
      console.warn('@vercel/flags-core: Using bundled definitions as fallback');
      this.cache.seed(tagData(bundled, 'bundled'));
      this.transition('degraded');
      return [this.cache.read()!, 'STALE'];
    }

    // Last resort: one-time fetch (only when no stream/poll configured)
    if (!this.options.stream.enabled && !this.options.polling.enabled) {
      let fetched: DatafileInput | undefined;
      try {
        fetched = await fetchDatafile({
          host: this.options.host,
          auth: this.options.auth,
          fetch: this.options.fetch,
        });
      } catch {
        // fetch failed — fall through to throw
      }
      if (fetched) {
        this.cache.seed(tagData(fetched, 'fetched'));
        this.transition('degraded');
        return [this.cache.read()!, 'MISS'];
      }
    }

    throw new Error(
      '@vercel/flags-core: No flag definitions available. ' +
        'Provide a datafile or bundled definitions.',
    );
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
    datafile: Datafile,
  ): void {
    if (this.unauthorized) return;
    if (this.options.buildStep && this.buildReadTracked) return;
    if (this.options.buildStep) this.buildReadTracked = true;

    const configOrigin: 'in-memory' | 'embedded' =
      datafile.metrics.source === 'embedded' ? 'embedded' : 'in-memory';
    const cacheAction: 'FOLLOWING' | 'REFRESHING' | 'NONE' =
      this.state === 'streaming'
        ? 'FOLLOWING'
        : this.state === 'polling'
          ? 'REFRESHING'
          : 'NONE';
    const mode = this.mode;
    const trackOptions: TrackReadOptions = {
      configOrigin,
      cacheStatus: cacheHadDefinitions ? 'HIT' : 'MISS',
      cacheAction,
      cacheIsBlocking: !cacheHadDefinitions,
      duration: Date.now() - startTime,
      mode:
        mode === 'streaming' ? 'stream' : mode === 'polling' ? 'poll' : mode,
    };
    const configUpdatedAt = datafile.configUpdatedAt;
    if (typeof configUpdatedAt === 'number') {
      trackOptions.configUpdatedAt = configUpdatedAt;
    }
    const revision = datafile.revision;
    if (typeof revision === 'number') {
      trackOptions.revision = revision;
    }
    if (isFirstRead) {
      trackOptions.cacheIsFirstRead = true;
    }
    this.usageTracker.trackRead(trackOptions);
  }

  /**
   * Tracks a flag evaluation for usage analytics.
   */
  trackEvaluation(options: TrackEvaluationOptions): void {
    if (this.unauthorized || this.options.disableMetrics) return;

    this.usageTracker.trackEvaluation({
      ...options,
      clientName: options.clientName ?? this.options.clientName,
    });
  }
}
