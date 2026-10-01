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
import { unauthorizedMessage } from './auth';
import { BundledSource } from './bundled-source';
import {
  type CacheReadPolicy,
  type CacheResult,
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

function tagFetchedData(data: DatafileInput): TaggedData {
  return tagData({ ...data, fetchedAt: Date.now() }, 'fetched');
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
  | 'vercel'
  | 'degraded'
  | 'build:loading'
  | 'build:ready'
  | 'shutdown';

type RuntimeSource = 'header' | 'stream' | 'polling';

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
 * - Uses streaming with polling fallback when enabled
 * - Retains provided/bundled data during startup; fetches if the cache remains empty
 * - Stale reads refresh in the background; expired reads wait for refresh
 *
 * **Runtime — polling mode** (polling enabled, stream disabled):
 * - Uses polling exclusively
 * - Same fallback chains as streaming mode
 *
 * **Runtime — Vercel mode** (vercel enabled, with stream or polling enabled):
 * - Loads provided/bundled data before selecting the mode; no startup network
 * - HeaderSource checks request versions and refreshes when needed
 * - A read without a valid project version header permanently starts stream/poll
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
  private sourceStartup: Promise<void> | undefined;
  // A startup timeout permits cached reads while the first update continues.
  private startupFallback = false;

  // Usage tracking
  private usageTracker: UsageTracker;
  private isFirstGetData: boolean = true;

  // Build-step deduplication
  private buildDataPromise: Promise<TaggedData> | null = null;
  private buildReadTracked = false;

  // Suppresses usage tracking while the credential is rejected. Set on a 401
  // from any source, cleared as soon as a source delivers data again.
  private unauthorized = false;

  constructor(options: ControllerOptions) {
    this.options = normalizeOptions(options);
    this.cache = new DatafileCache(
      async (signal) => {
        try {
          const data = await fetchDatafile({ ...this.options, signal });
          signal.throwIfAborted();
          this.startupFallback = false;
          this.unauthorized = false;
          return data;
        } catch (error) {
          signal.throwIfAborted();
          this.startupFallback = false;
          this.noteUnauthorized(error);
          throw error;
        }
      },
      this.options.staleIfErrorMs,
      this.options.waitUntil,
    );

    // Create source modules
    this.streamSource = new StreamSource(
      this.options,
      () => this.cache.revision,
    );

    this.pollingSource = new PollingSource({
      polling: this.options.polling,
      refresh: () => this.cache.refresh('poll'),
    });
    this.headerSource = new HeaderSource(this.options);

    this.bundledSource = new BundledSource({
      auth: this.options.auth,
      readBundledDefinitions,
    });

    // Wire source events to state machine
    this.wireSourceEvents();

    // If datafile provided, use it immediately
    if (this.options.datafile) {
      this.cache.seed(tagData({ ...this.options.datafile }, 'provided'));
    }

    this.usageTracker = new UsageTracker(this.options);
  }

  // Source event handlers (stored for cleanup)
  private onStreamData = (data: DatafileInput) => {
    this.unauthorized = false;
    this.startupFallback = false;
    this.cache.updateFromSource(data, 'stream');
  };
  private onStreamPrimed = (message: PrimedMessage) => {
    this.unauthorized = false;
    if (this.cache.tryConfirm(message, 'revision', 'stream')) {
      this.startupFallback = false;
    }
    // The stream is connected even if its revision no longer matches the cache.
    if (this.state === 'degraded' || this.state === 'initializing:stream') {
      this.transition('streaming');
    }
  };
  private onStreamPing = () => {
    // Each connection sends primed/datafile before pings, so a ping confirms recovery.
    this.cache.confirm('stream');
    this.startupFallback = false;
  };
  private onStreamConnected = () => {
    if (this.state === 'polling') {
      this.pollingSource.stop();
      this.transition('streaming');
    } else if (
      this.state === 'degraded' ||
      this.state === 'initializing:stream'
    ) {
      this.transition('streaming');
    }
  };
  private onStreamDisconnected = () => {
    this.cache.fail(new Error('stream: disconnected'));
    if (this.state === 'streaming') {
      this.transition('degraded');
      void this.activateFallbackSource('stream');
    }
  };
  private onSourceError = (error: Error) => {
    this.noteUnauthorized(error);
    this.cache.fail(error);
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
    this.pollingSource.on('error', this.onSourceError);
  }

  private unwireSourceEvents(): void {
    this.streamSource.off('data', this.onStreamData);
    this.streamSource.off('primed', this.onStreamPrimed);
    this.streamSource.off('ping', this.onStreamPing);
    this.streamSource.off('connected', this.onStreamConnected);
    this.streamSource.off('disconnected', this.onStreamDisconnected);
    this.streamSource.off('error', this.onSourceError);
    this.pollingSource.off('error', this.onSourceError);
  }

  // ---------------------------------------------------------------------------
  // State machine
  // ---------------------------------------------------------------------------

  private transition(to: State): void {
    this.state = to;
  }

  private get isShutdown(): boolean {
    return this.state === 'shutdown';
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
      this.cache.seed(tagData({ ...this.options.datafile }, 'provided'));
    }

    // If no data yet, try loading bundled definitions eagerly so we can
    // send the revision to the stream and potentially get a lightweight
    // "primed" response instead of a full datafile.
    if (!this.cache.hasData) {
      try {
        const bundled = await this.bundledSource.tryLoad();
        if (bundled) this.cache.seed(tagData({ ...bundled }, 'bundled'));
      } catch {
        // Bundled definitions not available — proceed without revision
      }
    }

    // Select header mode after hydration so provided/bundled data avoids a cold fetch.
    if (this.headerSource.isEnabled()) {
      this.transition('vercel');
      return;
    }

    if (!this.options.stream.enabled && !this.options.polling.enabled) {
      await this.initializeFromFallbacks();
      return;
    }

    await this.activateFallbackSource('header');
    if (this.cache.hasData) return;
    if (this.unauthorized) {
      throw this.noDefinitionsError(
        '. Provide a datafile or bundled definitions.',
      );
    }

    // All update sources share the same final blocking datafile fetch.
    const fetched = await this.cache.resolve(this.cacheReadPolicy);
    if (!fetched) await this.initializeFromFallbacks();
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
        connectionState: this.isConnected
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
      this.cache.seed(tagData({ ...this.options.datafile }, 'provided'));
    }
    this.transition('shutdown');
    await this.usageTracker.shutdown();
  }

  /**
   * Resolves the datafile through the same freshness and source policy as reads.
   * Builds the response without recording an evaluation read event.
   */
  async getDatafile(): Promise<Datafile> {
    const startTime = Date.now();
    this.isFirstGetData = false;

    const [result, cacheStatus] = await this.resolveData();

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
  // Data resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolves the current data, using the appropriate strategy for the
   * current mode. Returns tagged data and cache status.
   *
   * Build step: cached → bundled → one-time fetch
   * Runtime: source policy chooses cached data or refresh; fall back if empty.
   */
  private async resolveData(): Promise<[TaggedData, Metrics['cacheStatus']]> {
    if (this.options.buildStep) {
      return this.resolveDataForBuildStep();
    }

    return this.resolveRuntimeData();
  }

  /** Initializes the active runtime source, then resolves through its policy. */
  private async resolveRuntimeData(): Promise<
    [TaggedData, Metrics['cacheStatus']]
  > {
    if (this.sourceStartup) {
      await this.sourceStartup;
    }

    if (!this.cache.hasData && this.unauthorized) {
      throw this.noDefinitionsError(
        '. Provide a datafile or bundled definitions.',
      );
    }

    if (
      !this.cache.hasData &&
      !this.options.stream.enabled &&
      !this.options.polling.enabled
    ) {
      return this.resolveStaticFallbackData();
    }

    const headerMode = this.state === 'vercel';
    let result: CacheResult | undefined;
    try {
      result = await this.cache.resolve(this.cacheReadPolicy);
    } catch (error) {
      if (!headerMode || this.cache.hasData || this.isShutdown) {
        throw error;
      }
      // A failed cold fetch leaves headers unable to identify this client's project.
    }

    if (result?.[2] || (!result && headerMode)) {
      if (this.state === 'vercel') {
        await this.activateFallbackSource('header');
      }
      return this.resolveRuntimeData();
    }
    if (result) {
      return [result[0], result[1]];
    }

    return this.resolveStaticFallbackData();
  }

  private get cacheReadPolicy(): CacheReadPolicy {
    if (this.state === 'vercel') {
      return {
        assess: this.headerSource.getAssessment(),
        retryOnFailure: true,
      };
    }

    if (this.startupFallback) {
      return { assess: () => ({ status: 'stale' }) };
    }

    if (this.state === 'streaming') {
      return { assess: this.streamSource.assess };
    }

    if (this.state === 'polling' || this.state === 'initializing:polling') {
      return { assess: this.pollingSource.assess };
    }

    return { assess: () => ({ status: 'unknown' }) };
  }

  /**
   * Advances through the runtime source chain. Every caller uses the same path:
   * request headers → stream → polling → direct cache refresh.
   */
  private activateFallbackSource(after: RuntimeSource): Promise<void> {
    if (this.sourceStartup) {
      return this.sourceStartup;
    }
    const startup = this.startFallbackSource(after).finally(() => {
      if (this.sourceStartup === startup) {
        this.sourceStartup = undefined;
      }
    });
    this.sourceStartup = startup;
    return startup;
  }

  private async startFallbackSource(after: RuntimeSource): Promise<void> {
    if (this.state === 'shutdown') {
      throw new Error('@vercel/flags-core: Client is shut down');
    }

    if (after === 'header' && this.options.stream.enabled) {
      this.transition('initializing:stream');
      const connected = await this.tryInitializeStream();
      if (this.isShutdown) {
        throw new Error('@vercel/flags-core: Client is shut down');
      }
      if (connected) {
        this.transition('streaming');
        return;
      }
      after = 'stream';
    }

    if (
      (after === 'header' || after === 'stream') &&
      this.options.polling.enabled
    ) {
      this.pollingSource.startInterval();
      this.transition('polling');
      // Repair a disconnected stream immediately; reads share this background poll.
      if (after === 'header') {
        await this.initializePolling();
      } else {
        void this.pollingSource.poll().catch(() => {});
      }
      if (this.isShutdown) {
        throw new Error('@vercel/flags-core: Client is shut down');
      }
      return;
    }

    this.transition('degraded');
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
        this.noteUnauthorized(error);
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
        this.startupFallback = true;
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
      this.noteUnauthorized(error);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Polling initialization
  // ---------------------------------------------------------------------------

  /**
   * Waits for the first poll when polling is the primary runtime source.
   * On timeout, initialization falls back while the pending poll and interval
   * continue in the background. Poll errors propagate if no data is cached or
   * the client is shutting down.
   */
  private async initializePolling(): Promise<void> {
    const poll = this.pollingSource.poll().catch((error) => {
      // Initialization can finish with retained data; serving still enforces SIE.
      if (!this.cache.hasData || this.isShutdown) {
        throw error;
      }
    });
    const timeoutMs = this.options.polling.initTimeoutMs;
    if (timeoutMs <= 0) {
      await poll;
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        poll,
        new Promise<'timeout'>((resolve) => {
          timeoutId = setTimeout(() => resolve('timeout'), timeoutMs);
        }),
      ]);
      if (outcome === 'timeout') {
        this.startupFallback = true;
        console.warn(
          '@vercel/flags-core: Polling initialization timeout, falling back while continuing to poll in the background',
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private noteUnauthorized(error: unknown): void {
    if (
      error instanceof UnauthorizedError ||
      (error instanceof Error &&
        (error.message.includes('401') ||
          ('status' in error && error.status === 401)))
    ) {
      this.unauthorized = true;
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
    if (bundled) return tagData({ ...bundled }, 'bundled');

    // Fallback: one-time fetch
    try {
      const fetched = await fetchDatafile({
        host: this.options.host,
        auth: this.options.auth,
        fetch: this.options.fetch,
      });
      return tagFetchedData(fetched);
    } catch (error) {
      this.noteUnauthorized(error);
    }

    throw this.noDefinitionsError(
      ' during build. Provide a datafile or bundled definitions.',
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
      this.cache.seed(tagData({ ...bundled }, 'bundled'));
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
        this.cache.seed(tagFetchedData(fetched));
        this.transition('degraded');
        return;
      } catch {
        // fetch failed — fall through to throw
      }
    }

    throw this.noDefinitionsError('. Bundled definitions not found.');
  }

  /**
   * `detail` continues the sentence "No flag definitions available", so it
   * starts with either "." or " during build.".
   */
  private noDefinitionsError(detail: string): Error {
    const { sourceProjectId } = this.options.auth;
    const reason =
      this.unauthorized && sourceProjectId
        ? ` Request was ${unauthorizedMessage(sourceProjectId)}`
        : '';
    return new Error(
      `@vercel/flags-core: No flag definitions available${detail}${reason}`,
    );
  }

  /**
   * Retrieves data when the cache is empty or header mode is unavailable.
   * Streaming mode: stream → datafile → bundled.
   * Polling mode: poll → datafile → bundled.
   * Offline mode: datafile → bundled → one-time fetch.
   */
  private async resolveStaticFallbackData(): Promise<
    [TaggedData, Metrics['cacheStatus']]
  > {
    // Handover can start with newer cached data; do not replace it with a seed.
    const cached = this.cache.read();
    if (cached) return [cached, 'STALE'];

    // Fallback chain: datafile → bundled → one-time fetch
    this.transition('initializing:fallback');

    if (this.options.datafile) {
      this.cache.seed(tagData({ ...this.options.datafile }, 'provided'));
      this.transition('degraded');
      return [this.cache.read()!, 'STALE'];
    }

    const bundled = await this.bundledSource.tryLoad();
    if (bundled) {
      console.warn('@vercel/flags-core: Using bundled definitions as fallback');
      this.cache.seed(tagData({ ...bundled }, 'bundled'));
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
        this.cache.seed(tagFetchedData(fetched));
        this.transition('degraded');
        return [this.cache.read()!, 'MISS'];
      }
    }

    throw this.noDefinitionsError(
      '. Provide a datafile or bundled definitions.',
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
