import type {
  BundledDefinitions,
  ControllerInterface,
  Datafile,
  DatafileInput,
  Metrics,
} from '../types';
import { readFlagsConfigVersion } from '../utils/edge-config-versions';
import { readBundledDefinitions } from '../utils/read-bundled-definitions';
import type { TrackReadOptions } from '../utils/usage/flags-config-read';
import type { TrackEvaluationOptions } from '../utils/usage/flags-evaluation';
import { UsageTracker } from '../utils/usage-tracker';
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
 * **Runtime — offline mode** (neither stream nor polling):
 * - Init fallback: constructor datafile → bundled → one-time fetch → throw
 * - Read fallback: in-memory value → constructor datafile → bundled → one-time fetch → throw
 */
export class Controller implements ControllerInterface {
  private options: NormalizedOptions;

  // State machine
  private state: State = 'idle';

  // Data state — tagged with origin
  private data: TaggedData | undefined;

  // Memoized data spread for read() / getDatafile().
  // Rebuilt only when `this.data` reference changes (e.g. on stream/poll update).
  // Holds the result of stripping `_origin`; metrics are appended per-call.
  private dataViewSource: TaggedData | undefined = undefined;
  private dataViewBase: DatafileInput | undefined = undefined;

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

  // Minimum configUpdatedAt the Edge Network advertises for this project, read
  // from the request context of every initialize/read call. Monotonic: a later
  // request carrying an older value never lowers it.
  //
  // Only this number is retained. The request context object and its headers
  // are never stored, so a module-scoped controller cannot keep a request
  // alive across invocations.
  private minUpdatedAt: number | undefined;

  // Highest minimum already forwarded on a source request (stream connect,
  // poll, or one-time fetch). That request is responsible for delivering data
  // which satisfies it, so no extra refresh is needed for it.
  private requestedMinUpdatedAt: number | undefined;

  // Highest minimum a refresh has already been attempted for, so a repeated
  // requirement never causes redundant work.
  private refreshedMinUpdatedAt: number | undefined;

  // Minimum targeted by the refresh currently in flight, if any.
  private refreshTarget: number | undefined;
  private refreshAbortController: AbortController | undefined;

  // Suppresses usage tracking when the SDK key is unauthorized
  private unauthorized = false;

  constructor(options: ControllerOptions) {
    this.options = normalizeOptions(options);

    // Create source modules
    this.streamSource = new StreamSource(this.options, {
      revision: () => this.data?.revision,
      configUpdatedAt: () => parseConfigUpdatedAt(this.data?.configUpdatedAt),
      minUpdatedAt: this.minUpdatedAtForRequest,
      canResolveInit: () => !this.isBelowMinUpdatedAt,
    });

    this.pollingSource = new PollingSource(
      this.options,
      this.minUpdatedAtForRequest,
    );

    this.bundledSource = new BundledSource({
      auth: this.options.auth,
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
  private onStreamPrimed = () => {
    // The server confirmed our revision is current — no new data needed.
    // Transition to streaming like a normal connected event.
    if (this.state === 'degraded' || this.state === 'initializing:stream') {
      this.transition('streaming');
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
    this.streamSource.on('primed', this.onStreamPrimed);
    this.streamSource.on('connected', this.onStreamConnected);
    this.streamSource.on('disconnected', this.onStreamDisconnected);
    this.pollingSource.on('data', this.onPollData);
    this.pollingSource.on('error', this.onPollError);
  }

  private unwireSourceEvents(): void {
    this.streamSource.off('data', this.onStreamData);
    this.streamSource.off('primed', this.onStreamPrimed);
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

  // ---------------------------------------------------------------------------
  // Minimum freshness requirement
  // ---------------------------------------------------------------------------

  /**
   * Re-reads the flag configuration version the Edge Network advertises for
   * this project and raises the minimum freshness requirement accordingly.
   *
   * Controllers are module-scoped and outlive individual requests, so this runs
   * on every initialize()/read()/getDatafile() call rather than once at
   * construction. The requirement only ever moves forward: a later warm request
   * carrying an older header cannot downgrade it.
   *
   * No-op during build steps and wherever no request context is available, so
   * build and non-Vercel behavior is unchanged.
   */
  private syncMinUpdatedAt(): void {
    if (this.options.buildStep) return;

    const projectId = this.data?.projectId ?? this.options.datafile?.projectId;
    if (!projectId) return;

    const advertised = readFlagsConfigVersion(projectId);
    if (advertised === undefined) return;

    if (this.minUpdatedAt === undefined || advertised > this.minUpdatedAt) {
      this.minUpdatedAt = advertised;
    }
  }

  /**
   * Returns the current requirement for an outgoing request and records that it
   * is being forwarded, so `scheduleRefresh()` knows the request in question is
   * already responsible for satisfying it.
   */
  private minUpdatedAtForRequest = (): number | undefined => {
    const required = this.minUpdatedAt;
    if (
      required !== undefined &&
      (this.requestedMinUpdatedAt === undefined ||
        required > this.requestedMinUpdatedAt)
    ) {
      this.requestedMinUpdatedAt = required;
    }
    return required;
  };

  /**
   * Whether the data currently held in memory is known to be older than the
   * minimum the Edge Network advertises. Data without a `configUpdatedAt`
   * cannot be proven fresh, so it counts as below the minimum.
   */
  private get isBelowMinUpdatedAt(): boolean {
    if (this.minUpdatedAt === undefined) return false;
    if (!this.data) return true;

    const currentTs = parseConfigUpdatedAt(this.data.configUpdatedAt);
    return currentTs === undefined || currentTs < this.minUpdatedAt;
  }

  /**
   * Cache status for the data currently held in memory. Data that is below the
   * advertised minimum is reported as STALE even while connected, so a response
   * that did not meet the minimum never looks fresh.
   */
  private get cacheStatusForCurrentData(): Metrics['cacheStatus'] {
    return this.isConnected && !this.isBelowMinUpdatedAt ? 'HIT' : 'STALE';
  }

  /**
   * Starts a single background refresh when the in-memory data is older than
   * the advertised minimum.
   *
   * Deduplicated per controller and target: a given requirement triggers at
   * most one refresh, whether it is observed once or on every warm request,
   * and a lower requirement seen later never triggers another. A requirement
   * already forwarded on a stream connection or poll is left to that request.
   *
   * The refresh runs in the background — callers keep serving the data they
   * already have, which read() reports as STALE.
   */
  private scheduleRefresh(): void {
    if (this.options.buildStep) return;
    if (this.state === 'shutdown') return;

    const target = this.minUpdatedAt;
    if (target === undefined) return;

    // Without data there is nothing to refresh: initialization applies the
    // requirement to the stream/poll request instead.
    if (!this.data) return;
    if (!this.isBelowMinUpdatedAt) return;

    // Already forwarded on a source request, which owns delivering data that
    // satisfies it.
    if (
      this.requestedMinUpdatedAt !== undefined &&
      this.requestedMinUpdatedAt >= target
    ) {
      return;
    }

    // Already attempted, or already covered by a refresh in flight.
    if (
      this.refreshedMinUpdatedAt !== undefined &&
      this.refreshedMinUpdatedAt >= target
    ) {
      return;
    }
    if (this.refreshTarget !== undefined && this.refreshTarget >= target) {
      return;
    }

    this.refreshTarget = target;
    void this.refresh(target);
  }

  /**
   * Fetches a datafile that satisfies `target`. Best effort: on failure the
   * existing data keeps being served, preserving the stale fallback.
   */
  private async refresh(target: number): Promise<void> {
    const abortController = new AbortController();
    this.refreshAbortController = abortController;

    try {
      const fetched = await fetchDatafile({
        host: this.options.host,
        auth: this.options.auth,
        fetch: this.options.fetch,
        signal: abortController.signal,
        minUpdatedAt: target,
      });

      if (this.state !== 'shutdown' && this.isNewerData(fetched)) {
        this.data = tagData(fetched, 'fetched');
      }
    } catch {
      // Keep the existing data — the refresh is best effort.
    } finally {
      this.refreshedMinUpdatedAt =
        this.refreshedMinUpdatedAt === undefined
          ? target
          : Math.max(this.refreshedMinUpdatedAt, target);
      if (this.refreshTarget === target) {
        this.refreshTarget = undefined;
      }
      if (this.refreshAbortController === abortController) {
        this.refreshAbortController = undefined;
      }
    }
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
   * Build step: datafile → bundled → one-time fetch
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

    try {
      await this.initializeAtRuntime();
    } finally {
      // Initialization could not reach the advertised minimum: start the single
      // deduplicated refresh now instead of waiting for the next read.
      this.scheduleRefresh();
    }
  }

  private async initializeAtRuntime(): Promise<void> {
    // Pick up the requirement advertised for this request before opening any
    // connection, so it can be forwarded on the very first attempt.
    this.syncMinUpdatedAt();

    // Hydrate from provided datafile if not already set (e.g., after shutdown)
    if (!this.data && this.options.datafile) {
      this.data = tagData(this.options.datafile, 'provided');
    }

    // If no data yet, try loading bundled definitions eagerly so we can
    // send the revision to the stream and potentially get a lightweight
    // "primed" response instead of a full datafile.
    if (!this.data) {
      try {
        const bundled = await this.bundledSource.tryLoad();
        if (bundled) {
          this.data = tagData(bundled, 'bundled');
        }
      } catch {
        // Bundled definitions not available — proceed without revision
      }

      // Bundled definitions may be the first thing to reveal the project id.
      this.syncMinUpdatedAt();
    }

    // If we already have data (from provided datafile or bundled definitions),
    // start updates. Both streaming and polling wait for initial data before
    // being considered initialized, so we know we have fresh data.
    // For no-updates (offline), return immediately since we already have usable data.
    if (this.data) {
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
    const cacheHadDefinitions = this.data !== undefined;
    const isFirstRead = this.isFirstGetData;
    this.isFirstGetData = false;

    // Re-read per request: a warm request may advertise a newer configuration
    // than the one this long-lived controller holds.
    this.syncMinUpdatedAt();
    this.scheduleRefresh();

    const [result, cacheStatus] = await this.resolveData();

    const readMs = Date.now() - startTime;
    const source = originToMetricsSource(result._origin);
    this.trackRead(startTime, cacheHadDefinitions, isFirstRead, source);

    if (this.dataViewSource !== result) {
      const { _origin, ...rest } = result;
      this.dataViewBase = rest;
      this.dataViewSource = result;
    }

    return {
      ...(this.dataViewBase as DatafileInput),
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
    this.refreshAbortController?.abort();
    this.refreshAbortController = undefined;
    this.data = this.options.datafile
      ? tagData(this.options.datafile, 'provided')
      : undefined;
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

    // Re-read per request: a warm request may advertise a newer configuration
    // than the one this long-lived controller holds.
    this.syncMinUpdatedAt();
    this.scheduleRefresh();

    let result: TaggedData;
    let cacheStatus: Metrics['cacheStatus'];

    if (this.options.buildStep) {
      [result, cacheStatus] = await this.resolveDataForBuildStep();
    } else if (this.data) {
      cacheStatus = this.cacheStatusForCurrentData;
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
            auth: this.options.auth,
            fetch: this.options.fetch,
            minUpdatedAt: this.minUpdatedAtForRequest(),
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

    if (this.dataViewSource !== result) {
      const { _origin, ...rest } = result;
      this.dataViewBase = rest;
      this.dataViewSource = result;
    }

    return {
      ...(this.dataViewBase as DatafileInput),
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
   * Build step: cached → bundled → one-time fetch
   * Runtime with cache: return cached data
   * Runtime without cache: stream/poll → datafile → bundled → fetch → throw
   */
  private async resolveData(): Promise<[TaggedData, Metrics['cacheStatus']]> {
    if (this.options.buildStep) {
      return this.resolveDataForBuildStep();
    }

    if (this.data) {
      return [this.data, this.cacheStatusForCurrentData];
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
        return this.completePollingInit();
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

      return this.completePollingInit();
    } catch {
      clearTimeout(timeoutId!);
      return false;
    }
  }

  /**
   * Starts the polling interval once the first poll produced data.
   *
   * Reports success only when that data meets the advertised minimum: a
   * response below the minimum keeps polling running in the background but
   * must not resolve initialization as fresh.
   */
  private completePollingInit(): boolean {
    if (!this.data) return false;
    this.pollingSource.startInterval();
    return !this.isBelowMinUpdatedAt;
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
          auth: this.options.auth,
          fetch: this.options.fetch,
          minUpdatedAt: this.minUpdatedAtForRequest(),
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
          auth: this.options.auth,
          fetch: this.options.fetch,
          minUpdatedAt: this.minUpdatedAtForRequest(),
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
    const configUpdatedAt = this.data?.configUpdatedAt;
    if (typeof configUpdatedAt === 'number') {
      trackOptions.configUpdatedAt = configUpdatedAt;
    }
    const revision = this.data?.revision;
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
