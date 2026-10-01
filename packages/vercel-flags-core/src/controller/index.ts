import type {
  BundledDefinitions,
  ControllerInterface,
  Datafile,
  DatafileInput,
  InitializeOptions,
  Metrics,
} from '../types';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import { hasRequestHeaders } from '../utils/request-context';
import type { TrackReadOptions } from '../utils/usage/flags-config-read';
import type { TrackEvaluationOptions } from '../utils/usage/flags-evaluation';
import { UsageTracker } from '../utils/usage-tracker';
import { unauthorizedMessage } from './auth';
import { BundledSource } from './bundled-source';
import { type CacheReadPolicy, DatafileCache } from './datafile-cache';
import { debug } from './debug';
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

const UNKNOWN_FRESHNESS: CacheReadPolicy = {
  assess: () => ({ status: 'unknown' }),
};

function isUnauthorizedError(error: unknown): boolean {
  if (error instanceof UnauthorizedError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes('401') || ('status' in error && error.status === 401)
  );
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** How a stream startup attempt ended; `connecting` keeps trying in the background. */
type StreamStartup = 'connected' | 'connecting' | 'failed';

/**
 * Explicit states for the controller state machine.
 */
type State =
  | 'idle'
  | 'initializing:stream'
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
 * - Streams exclusively; a startup timeout keeps connecting in the background
 * - Retains provided/bundled data during startup; fetches if the cache remains empty
 * - Reads always serve the cache while streaming; old data is labeled stale, never refetched over HTTP
 * - Polling starts only once the stream gives up (retries exhausted, 401, or token failure)
 * - Without a live source (`degraded`), reads apply stale-while-revalidate over HTTP
 *
 * **Runtime — polling mode** (polling enabled, stream disabled):
 * - Uses polling exclusively; a 401 stops polling and reads revalidate over HTTP
 * - Same fallback chains as streaming mode
 *
 * **Runtime — Vercel mode** (vercel enabled, with stream or polling enabled):
 * - Loads provided/bundled data before selecting the mode
 * - Module-scope initialization starts no network; inside a request it prepares
 *   the cache like the first evaluation (confirm, fetch, or start stream/poll)
 * - HeaderSource checks request versions and refreshes when needed
 * - An evaluation without a valid project version header permanently starts stream/poll
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
  // Runtime sources are set up; later initialize() calls only prepare requests.
  private runtimeInitialized = false;

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
  // Read policy while no live source confirms the cache; derived once from the options.
  private readonly degradedReadPolicy: CacheReadPolicy;

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
          this.unauthorized = false;
          return data;
        } catch (error) {
          signal.throwIfAborted();
          this.noteUnauthorized(error);
          throw error;
        }
      },
      this.options.staleIfErrorMs,
      this.options.waitUntil,
      this.options.clientName,
    );

    // Create source modules
    this.streamSource = new StreamSource(
      this.options,
      () => this.cache.revision,
    );

    this.pollingSource = new PollingSource({
      clientName: this.options.clientName,
      polling: this.options.polling,
      staleWhileRevalidateMs: this.options.staleWhileRevalidateMs,
      refresh: () => this.cache.refresh('poll'),
    });
    this.headerSource = new HeaderSource(this.options);
    this.degradedReadPolicy = this.createDegradedReadPolicy();

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
    debug(this.options.clientName, 'client.created', () => ({
      ...this.debugState(),
      buildStep: this.options.buildStep,
      vercel: this.options.vercel,
      stream: this.options.stream.enabled,
      streamInitTimeoutMs: this.options.stream.initTimeoutMs,
      polling: this.options.polling.enabled,
      pollingIntervalMs: this.options.polling.intervalMs,
      pollingInitTimeoutMs: this.options.polling.initTimeoutMs,
      staleWhileRevalidateMs: this.options.staleWhileRevalidateMs,
      staleIfErrorMs: this.options.staleIfErrorMs,
    }));
  }

  // Source event handlers (stored for cleanup)
  private onStreamData = (data: DatafileInput) => {
    debug(this.options.clientName, 'stream.data', () => ({
      projectId: data.projectId,
      revision: data.revision,
      configUpdatedAt: Number(data.configUpdatedAt),
    }));
    this.unauthorized = false;
    this.cache.updateFromSource(data, 'stream');
  };
  private onStreamPrimed = (message: PrimedMessage) => {
    this.unauthorized = false;
    const confirmed = this.cache.tryConfirm(message, 'revision', 'stream');
    debug(this.options.clientName, 'stream.primed', () => ({
      ...this.debugState(),
      incomingRevision: message.revision,
      confirmed,
    }));
    // The stream is connected even if its revision no longer matches the cache.
    if (this.state === 'degraded' || this.state === 'initializing:stream') {
      this.transition('streaming', 'stream-primed');
    }
  };
  private onStreamPing = () => {
    debug(this.options.clientName, 'stream.ping', this.debugState);
    // Each connection sends primed/datafile before pings, so a ping confirms recovery.
    this.cache.confirm('stream');
  };
  private onStreamConnected = () => {
    if (this.state === 'degraded' || this.state === 'initializing:stream') {
      this.transition('streaming', 'stream-connected');
    }
  };
  private onStreamDisconnected = () => {
    debug(this.options.clientName, 'stream.disconnected', this.debugState);
    this.cache.fail(new Error('stream: disconnected'));
    // The stream reconnects on its own; polling waits until it gives up.
    if (this.state === 'streaming') {
      this.transition('degraded', 'stream-disconnected');
    }
  };
  private onStreamExhausted = () => {
    // Startup handles a stream that gives up before it connects. Later the
    // client is streaming (silent reconnects) or degraded (after a disconnect),
    // and the source chain continues with polling or HTTP revalidation.
    if (this.state !== 'streaming' && this.state !== 'degraded') {
      return;
    }
    // Reads can await this shared startup, but the event handler has no caller.
    // Handle its rejection too, including cancellation during shutdown.
    void this.activateFallbackSource().catch(() => {});
  };
  private onSourceError = (error: Error) => {
    this.noteUnauthorized(error);
    this.cache.fail(error);
  };
  private onPollingError = (error: Error) => {
    this.onSourceError(error);
    // Polling again will not fix a rejected credential. Give up like the
    // stream does; degraded reads revalidate over HTTP once it is fixed.
    if (this.state === 'polling' && isUnauthorizedError(error)) {
      this.pollingSource.stop();
      this.transition('degraded', 'polling-unauthorized');
    }
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
    this.streamSource.on('exhausted', this.onStreamExhausted);
    this.streamSource.on('error', this.onSourceError);
    this.pollingSource.on('error', this.onPollingError);
  }

  private unwireSourceEvents(): void {
    this.streamSource.off('data', this.onStreamData);
    this.streamSource.off('primed', this.onStreamPrimed);
    this.streamSource.off('ping', this.onStreamPing);
    this.streamSource.off('connected', this.onStreamConnected);
    this.streamSource.off('disconnected', this.onStreamDisconnected);
    this.streamSource.off('exhausted', this.onStreamExhausted);
    this.streamSource.off('error', this.onSourceError);
    this.pollingSource.off('error', this.onPollingError);
  }

  // ---------------------------------------------------------------------------
  // State machine
  // ---------------------------------------------------------------------------

  private debugState = () => ({
    state: this.state,
    mode: this.mode,
    projectId: this.cache.metadata?.projectId,
    hasData: this.cache.hasData,
    revision: this.cache.revision,
    ageMs: this.cache.ageMs,
    unauthorized: this.unauthorized,
  });

  private transition(to: State, reason: string): void {
    const from = this.state;
    this.state = to;
    if (from !== to) {
      debug(this.options.clientName, 'client.state', () => ({
        ...this.debugState(),
        from,
        to,
        reason,
      }));
    }
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
   * Initializes the data source. Safe to call repeatedly: runtime sources are
   * set up once, and every call made inside a request prepares the cache for it.
   *
   * Build step: datafile → bundled → one-time fetch
   * Streaming mode: stream → datafile → bundled
   * Polling mode (no stream): poll → datafile → bundled
   * Vercel mode: datafile → bundled; inside a request, resolve like a read
   * Offline mode (neither): datafile → bundled → one-time fetch
   */
  async initialize({
    prepareRequest = true,
  }: InitializeOptions = {}): Promise<void> {
    debug(this.options.clientName, 'client.initialize', this.debugState);
    if (this.options.buildStep) {
      this.transition('build:loading', 'build-initialize');
      await this.initializeForBuildStep();
      this.transition('build:ready', 'build-data-ready');
      return;
    }

    if (!this.runtimeInitialized) {
      await this.initializeRuntime();
      this.runtimeInitialized = true;
    }

    if (prepareRequest && this.state === 'vercel' && hasRequestHeaders()) {
      await this.prepareForRequest();
    }
  }

  /**
   * Prepares the cache for the current request the way its first evaluation
   * would: a matching version header confirms the cache without network, a
   * newer version or an empty cache fetches, and a header without this
   * project's entry starts streaming or polling. Failures reject only while no
   * definitions are cached; later reads retry them.
   */
  private async prepareForRequest(): Promise<void> {
    try {
      await this.resolveRuntimeData();
    } catch (error) {
      if (!this.cache.hasData) {
        throw error;
      }
    }
  }

  /** Sets up runtime sources once per lifecycle; failures are retried by the next call. */
  private async initializeRuntime(): Promise<void> {
    if (this.isShutdown) {
      // Reinitialization after shutdown rewires the sources it stopped.
      this.wireSourceEvents();
      this.transition('idle', 'restart-after-shutdown');
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
      this.transition('vercel', 'header-mode-enabled');
      return;
    }

    if (!this.options.stream.enabled && !this.options.polling.enabled) {
      await this.initializeFromFallbacks();
      return;
    }

    await this.activateFallbackSource();
    if (this.cache.hasData) return;
    if (this.unauthorized) {
      throw this.noDefinitionsError(
        '. Provide a datafile or bundled definitions.',
      );
    }

    // All update sources share the same final blocking datafile fetch.
    const fetched = await this.cache.resolve(this.cacheReadPolicy);
    if (!fetched.data) {
      await this.initializeFromFallbacks();
    }
  }

  /**
   * Reads the current datafile with metrics.
   */
  async read(): Promise<Datafile> {
    const startTime = Date.now();
    const cacheHadDefinitions = this.cache.hasData;
    const isFirstRead = this.isFirstGetData;
    this.isFirstGetData = false;

    debug(this.options.clientName, 'client.read.start', this.debugState);
    const [result, cacheStatus] = await this.resolveData().catch((error) => {
      debug(this.options.clientName, 'client.read.failed', this.debugState);
      throw error;
    });

    const datafile = this.toDatafile(result, cacheStatus, startTime);
    debug(this.options.clientName, 'client.read', () => ({
      ...this.debugState(),
      ...datafile.metrics,
    }));
    this.trackRead(startTime, cacheHadDefinitions, isFirstRead, datafile);
    return datafile;
  }

  /**
   * Shuts down the data source and releases resources.
   */
  async shutdown(): Promise<void> {
    debug(this.options.clientName, 'client.shutdown.start', this.debugState);
    this.unwireSourceEvents();
    this.streamSource.stop();
    this.pollingSource.stop();
    this.headerSource.stop();
    this.cache.clear();
    if (this.options.datafile) {
      this.cache.seed(tagData({ ...this.options.datafile }, 'provided'));
    }
    this.runtimeInitialized = false;
    this.transition('shutdown', 'shutdown');
    await this.usageTracker.shutdown();
    debug(this.options.clientName, 'client.shutdown.complete', this.debugState);
  }

  /**
   * Returns the datafile with metrics as a snapshot: it never starts streaming
   * or polling. Cached data is served through the active source policy
   * (header checks and HTTP revalidation); an empty cache loads bundled
   * definitions, then performs a one-time fetch.
   */
  async getDatafile(): Promise<Datafile> {
    debug(this.options.clientName, 'client.getDatafile.start', this.debugState);
    const startTime = Date.now();
    this.isFirstGetData = false;

    const [result, cacheStatus] = await this.resolveSnapshot().catch((error) => {
      debug(
        this.options.clientName,
        'client.getDatafile.failed',
        this.debugState,
      );
      throw error;
    });

    const datafile = this.toDatafile(result, cacheStatus, startTime);
    debug(this.options.clientName, 'client.getDatafile', () => ({
      ...this.debugState(),
      cacheStatus,
      origin: result._origin,
    }));
    return datafile;
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

  private toDatafile(
    result: TaggedData,
    cacheStatus: Metrics['cacheStatus'],
    startTime: number,
  ): Datafile {
    if (this.dataViewSource !== result) {
      const { _origin, ...rest } = result;
      this.dataViewBase = rest;
      this.dataViewSource = result;
    }

    debug(this.options.clientName, 'client.getDatafile', () => ({
      ...this.debugState(),
      cacheStatus,
      origin: result._origin,
    }));
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
      debug(this.options.clientName, 'source.startup.shared', this.debugState);
      await this.sourceStartup;
    }

    if (
      !this.cache.hasData &&
      !this.options.stream.enabled &&
      !this.options.polling.enabled
    ) {
      return this.resolveStaticFallbackData();
    }

    const result = await this.cache.resolve(this.cacheReadPolicy);

    if (result.hasError || !result.data) {
      debug(this.options.clientName, 'header.fallback', () => ({
        ...this.debugState(),
        reason: 'source-assessment-error',
      }));
      await this.activateFallbackSource();
      return this.resolveRuntimeData();
    }

    return [result.data, result.status];
  }

  /**
   * Resolves data for getDatafile() without starting a runtime source.
   * Build step: cached → bundled → one-time fetch
   * Runtime: cached data through the source policy; otherwise bundled → one-time fetch → throw
   */
  private async resolveSnapshot(): Promise<
    [TaggedData, Metrics['cacheStatus']]
  > {
    if (this.options.buildStep) {
      return this.resolveDataForBuildStep();
    }

    if (this.sourceStartup) {
      // Share a startup already in flight, but fall back on its failure.
      await this.sourceStartup.catch(() => {});
    }

    // Header mode needs no network to select, so snapshots can use it too.
    if (this.state === 'idle' && this.headerSource.isEnabled()) {
      this.transition('vercel', 'header-mode-enabled');
    }

    if (!this.cache.hasData) {
      const bundled = await this.bundledSource.tryLoad();
      if (bundled) {
        this.cache.seed(tagData({ ...bundled }, 'bundled'));
      }
    }

    if (this.cache.hasData || this.state === 'vercel') {
      const result = await this.cache.resolve(this.cacheReadPolicy);
      // A source assessment error does not switch sources here; the cache's
      // failure policy still decides whether the retained entry can be served.
      const cached = result.data ?? this.cache.read();
      if (cached) {
        return [cached, result.status];
      }
    }

    // One-time fetch as last resort
    try {
      await this.cache.refresh();
    } catch {
      throw this.noDefinitionsError(
        '. Initialize the client or provide a datafile.',
      );
    }
    const fetched = this.cache.read();
    if (!fetched) {
      throw this.noDefinitionsError(
        '. Initialize the client or provide a datafile.',
      );
    }
    return [fetched, 'MISS'];
  }

  private get cacheReadPolicy(): CacheReadPolicy {
    if (this.state === 'vercel') {
      return {
        assess: this.headerSource.getAssessment(),
        retryOnFailure: true,
      };
    }

    if (this.state === 'streaming') {
      // The stream owns refreshes: no HTTP work competes with a live connection.
      return { assess: this.streamSource.assess, sourceRefreshes: true };
    }

    if (this.state === 'polling') {
      return { assess: this.pollingSource.assess };
    }

    if (this.state === 'degraded') {
      return this.degradedReadPolicy;
    }

    // Startup in progress: serve cached data until the source confirms it.
    return UNKNOWN_FRESHNESS;
  }

  /**
   * Without a live source nothing confirms the cache, so reads apply plain
   * stale-while-revalidate over HTTP from the two public windows: data
   * refreshed within `staleWhileRevalidateMs` is served as is, older data is
   * served while refreshing in the background, and data older than that
   * window plus `staleIfErrorMs` is expired and waits for the refresh. An
   * unknown age is not known to be old, so it refreshes in the background.
   * Offline clients never refresh.
   */
  private createDegradedReadPolicy(): CacheReadPolicy {
    if (!this.options.stream.enabled && !this.options.polling.enabled) {
      return UNKNOWN_FRESHNESS;
    }
    const { staleWhileRevalidateMs, staleIfErrorMs } = this.options;
    const expiresAfterMs = staleWhileRevalidateMs + staleIfErrorMs;
    return {
      assess: ({ ageMs }) => {
        if (ageMs <= staleWhileRevalidateMs) {
          return { status: 'fresh' };
        }
        if (ageMs === Infinity || ageMs <= expiresAfterMs) {
          return { status: 'stale' };
        }
        return { status: 'expired' };
      },
      retryOnFailure: true,
    };
  }

  /**
   * Advances through the runtime source chain. Every caller uses the same path:
   * request headers → stream → polling → direct cache refresh.
   */
  private activateFallbackSource(): Promise<void> {
    if (this.sourceStartup) {
      debug(this.options.clientName, 'source.startup.shared', this.debugState);
      return this.sourceStartup;
    }
    debug(this.options.clientName, 'source.startup', this.debugState);
    const startup = this.startFallbackSource().finally(() => {
      if (this.sourceStartup === startup) {
        this.sourceStartup = undefined;
      }
      debug(this.options.clientName, 'source.startup.settled', this.debugState);
    });
    this.sourceStartup = startup;
    return startup;
  }

  private async startFallbackSource(): Promise<void> {
    if (this.isShutdown) {
      throw new Error('@vercel/flags-core: Client is shut down');
    }

    if (
      (this.state === 'idle' || this.state === 'vercel') &&
      this.options.stream.enabled
    ) {
      this.transition('initializing:stream', 'start-stream');
      const outcome = await this.tryInitializeStream();
      if (this.isShutdown) {
        throw new Error('@vercel/flags-core: Client is shut down');
      }
      if (outcome === 'connected' || this.isConnected) {
        this.transition('streaming', 'stream-initialized');
        return;
      }
      if (outcome === 'connecting' && this.streamSource.active) {
        // The stream keeps connecting in the background; polling waits until it gives up.
        this.transition('degraded', 'stream-still-connecting');
        return;
      }
    }

    if (this.options.polling.enabled) {
      // A retried initialization keeps the active polling source and waits for its poll again.
      if (this.state !== 'polling') {
        this.transition('polling', 'start-polling');
        this.pollingSource.startInterval();
      }
      await this.initializePolling();
      if (this.isShutdown) {
        throw new Error('@vercel/flags-core: Client is shut down');
      }
      return;
    }

    this.transition('degraded', 'no-active-update-source');
  }

  // ---------------------------------------------------------------------------
  // Stream initialization
  // ---------------------------------------------------------------------------

  /**
   * Attempts to initialize via stream with timeout. A timeout leaves the
   * stream connecting in the background; a rejection means it gave up.
   */
  private async tryInitializeStream(): Promise<StreamStartup> {
    debug(this.options.clientName, 'stream.initialize', () => ({
      timeoutMs: this.options.stream.initTimeoutMs,
      ...this.debugState(),
    }));
    if (this.options.stream.initTimeoutMs <= 0) {
      try {
        await this.streamSource.start();
        return 'connected';
      } catch (error) {
        this.noteUnauthorized(error);
        return 'failed';
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
        debug(this.options.clientName, 'stream.initialize.timeout', () => ({
          timeoutMs: this.options.stream.initTimeoutMs,
          ...this.debugState(),
        }));
        console.warn(
          '@vercel/flags-core: Stream initialization timeout, falling back while continuing to connect in the background',
        );
        // Don't stop stream - let it continue trying in background.
        // Swallow the rejection from the background stream promise to
        // avoid unhandled promise rejections when it is eventually aborted.
        if (this.streamSource.active) {
          void this.streamSource.start().catch(() => {});
        }
        return 'connecting';
      }

      return 'connected';
    } catch (error) {
      clearTimeout(timeoutId!);
      this.noteUnauthorized(error);
      return 'failed';
    }
  }

  // ---------------------------------------------------------------------------
  // Polling initialization
  // ---------------------------------------------------------------------------

  /**
   * Waits for the first poll whenever polling becomes the active runtime source.
   * On timeout, initialization falls back while the pending poll and interval
   * continue in the background. Poll errors propagate if no data is cached or
   * the client is shutting down.
   */
  private async initializePolling(): Promise<void> {
    debug(this.options.clientName, 'poll.initialize', () => ({
      timeoutMs: this.options.polling.initTimeoutMs,
      ...this.debugState(),
    }));
    const poll = this.pollingSource.poll().catch((error) => {
      // Initialization can finish with retained data; serving still enforces SIE.
      if (!this.cache.hasData || this.isShutdown) {
        throw error;
      }
      debug(
        this.options.clientName,
        'poll.initialize.fallback',
        this.debugState,
      );
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
        debug(this.options.clientName, 'poll.initialize.timeout', () => ({
          timeoutMs,
          ...this.debugState(),
        }));
        console.warn(
          '@vercel/flags-core: Polling initialization timeout, falling back while continuing to poll in the background',
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private noteUnauthorized(error: unknown): void {
    if (isUnauthorizedError(error)) {
      this.unauthorized = true;
      debug(this.options.clientName, 'client.unauthorized', this.debugState);
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
    const loaded = this.cache.read();
    if (loaded) {
      return [loaded, 'HIT'];
    }
    return [this.cache.seedAndRead(data), 'MISS'];
  }

  /**
   * Loads data for a build step: bundled → one-time fetch.
   */
  private async loadBuildData(): Promise<TaggedData> {
    const bundled = await this.bundledSource.tryLoad();
    if (bundled) return tagData({ ...bundled }, 'bundled');

    // Fallback: one-time fetch
    try {
      const fetched = await this.fetchOnce();
      return tagData({ ...fetched, fetchedAt: Date.now() }, 'fetched');
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

  private fetchOnce(): Promise<DatafileInput> {
    return fetchDatafile({
      host: this.options.host,
      clientName: this.options.clientName,
      auth: this.options.auth,
      fetch: this.options.fetch,
    });
  }

  /**
   * Stores a last-resort fetch as a source response, which clears any failure,
   * and serves it through the cache boundary.
   */
  private acceptLastResortFetch(fetched: DatafileInput): TaggedData {
    this.cache.updateFromSource(fetched, 'fetched');
    const remote = this.cache.read();
    if (!remote) {
      throw new Error('@vercel/flags-core: Fetch returned no definitions');
    }
    return remote;
  }

  /**
   * Shared fallback chain used by both initialize() and resolveData().
   */
  private async initializeFromFallbacks(): Promise<void> {
    this.transition('initializing:fallback', 'initialize-static-fallback');

    if (this.cache.hasData) {
      this.transition('degraded', 'cached-fallback');
      return;
    }

    const bundled = await this.bundledSource.tryLoad();
    if (bundled) {
      this.cache.seed(tagData({ ...bundled }, 'bundled'));
      this.transition('degraded', 'bundled-fallback');
      return;
    }

    // Last resort: one-time fetch (only when no stream/poll configured)
    if (!this.options.stream.enabled && !this.options.polling.enabled) {
      try {
        this.acceptLastResortFetch(await this.fetchOnce());
        this.transition('degraded', 'fetched-fallback');
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
    debug(this.options.clientName, 'client.no-definitions', this.debugState);
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
   * Retrieves data when the cache is empty in offline mode:
   * datafile → bundled → one-time fetch.
   */
  private async resolveStaticFallbackData(): Promise<
    [TaggedData, Metrics['cacheStatus']]
  > {
    // Handover can start with newer cached data; do not replace it with a seed.
    const cached = this.cache.read();
    if (cached) return [cached, 'STALE'];

    // Fallback chain: datafile → bundled → one-time fetch
    this.transition('initializing:fallback', 'read-static-fallback');

    if (this.options.datafile) {
      const provided = this.cache.seedAndRead(
        tagData({ ...this.options.datafile }, 'provided'),
      );
      this.transition('degraded', 'provided-fallback');
      return [provided, 'STALE'];
    }

    const bundled = await this.bundledSource.tryLoad();
    if (bundled) {
      console.warn('@vercel/flags-core: Using bundled definitions as fallback');
      const embedded = this.cache.seedAndRead(
        tagData({ ...bundled }, 'bundled'),
      );
      this.transition('degraded', 'bundled-fallback');
      return [embedded, 'STALE'];
    }

    // Last resort: one-time fetch (only when no stream/poll configured)
    if (!this.options.stream.enabled && !this.options.polling.enabled) {
      let fetched: DatafileInput | undefined;
      try {
        fetched = await this.fetchOnce();
      } catch {
        // fetch failed — fall through to throw
      }
      if (fetched) {
        const remote = this.acceptLastResortFetch(fetched);
        this.transition('degraded', 'fetched-fallback');
        return [remote, 'MISS'];
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
