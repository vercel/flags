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
import { fetchDatafile } from './fetch-datafile';
import { HeaderSource } from './header-source';
import {
  type ControllerOptions,
  type NormalizedOptions,
  normalizeOptions,
} from './normalized-options';
import { PollingSource } from './polling-source';
import { UnauthorizedError } from './stream-connection';
import { StreamSource } from './stream-source';
import {
  type DataOrigin,
  originToMetricsSource,
  type TaggedData,
  tagData,
} from './tagged-data';

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
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
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
 * **Runtime — updating modes**:
 * - Vercel uses request headers; elsewhere streaming takes precedence over polling
 * - The controller retains accepted data and records the first failure/disconnect
 * - Cached reads remain eligible for staleIfErrorMs from that first failure
 * - Accepted arrivals and confirmations clear the outage; failures do not extend it
 * - Sources keep their existing updates; SWR applies only to header revalidation
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
  // Holds the result of stripping internal metadata; metrics are appended per-call.
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
  private unhealthySince: number | undefined;
  private initializationPromise: Promise<void> | undefined;
  private backgroundRefresh: Promise<void> | undefined;

  private assertActive(): void {
    if (this.state === 'shutdown') {
      throw new Error('@vercel/flags-core: Client is shut down');
    }
  }

  constructor(options: ControllerOptions) {
    this.options = normalizeOptions(options);

    // Create source modules
    this.streamSource = new StreamSource(
      this.options,
      () => this.data?.revision,
    );

    this.pollingSource = new PollingSource(this.options);

    this.bundledSource = new BundledSource({
      auth: this.options.auth,
      readBundledDefinitions,
    });

    this.headerSource = new HeaderSource(this.options);

    // Wire source events to state machine
    this.wireSourceEvents();

    // If datafile provided, use it immediately
    if (this.options.datafile) {
      this.data = tagData(this.options.datafile, 'provided');
    }

    this.usageTracker = new UsageTracker(this.options);
  }

  private markUnhealthy = () => {
    this.unhealthySince ??= Date.now();
  };

  /** Accepted arrivals and unchanged confirmations end the current outage. */
  private acceptData(data: DatafileInput, origin: DataOrigin): void {
    if (this.isNewerData(data)) {
      this.data = tagData(data, origin);
      this.unhealthySince = undefined;
      return;
    }
    const version = parseConfigUpdatedAt(data.configUpdatedAt);
    if (
      origin !== 'fetched' &&
      version !== undefined &&
      version === parseConfigUpdatedAt(this.data?.configUpdatedAt)
    ) {
      this.unhealthySince = undefined;
      return;
    }
    this.markUnhealthy();
  }

  // Source event handlers (stored for cleanup)
  private onStreamData = (data: DatafileInput) =>
    this.acceptData(data, 'stream');
  private onStreamPrimed = () => {
    this.unhealthySince = undefined;
    this.onStreamConnected();
  };
  private onStreamConnected = () => {
    if (this.state === 'degraded' || this.state === 'initializing:stream') {
      this.transition('streaming');
    }
  };
  private onStreamDisconnected = () => {
    this.markUnhealthy();
    if (this.state === 'streaming') this.transition('degraded');
  };
  private onPollData = (data: DatafileInput) => this.acceptData(data, 'poll');
  private onPollError = (error: Error) => {
    this.markUnhealthy();
    console.error('@vercel/flags-core: Poll failed:', error);
  };
  private onFetchedData = (data: DatafileInput) => {
    if (parseConfigUpdatedAt(data.configUpdatedAt) === undefined) {
      this.markUnhealthy();
      return;
    }
    this.acceptData(data, 'fetched');
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

    this.headerSource.on('data', this.onFetchedData);
  }

  private unwireSourceEvents(): void {
    this.streamSource.off('data', this.onStreamData);
    this.streamSource.off('primed', this.onStreamPrimed);
    this.streamSource.off('connected', this.onStreamConnected);
    this.streamSource.off('disconnected', this.onStreamDisconnected);

    this.pollingSource.off('data', this.onPollData);
    this.pollingSource.off('error', this.onPollError);

    this.headerSource.off('data', this.onFetchedData);
  }

  // ---------------------------------------------------------------------------
  // State machine
  // ---------------------------------------------------------------------------

  private transition(to: State): void {
    this.assertActive();
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
    this.assertActive();
    if (this.initializationPromise) return this.initializationPromise;
    const pending = this.initializeSources().finally(() => {
      if (this.initializationPromise === pending)
        this.initializationPromise = undefined;
    });
    this.initializationPromise = pending;
    return pending;
  }

  private async initializeSources(): Promise<void> {
    this.assertActive();
    if (this.options.buildStep) {
      this.transition('build:loading');
      await this.initializeForBuildStep();
      this.transition('build:ready');
      return;
    }

    // Hydrate from provided datafile if not already set
    if (!this.data && this.options.datafile) {
      this.data = tagData(this.options.datafile, 'provided');
    }

    // If no data yet, try loading bundled definitions eagerly so we can
    // send the revision to the stream and potentially get a lightweight
    // "primed" response instead of a full datafile.
    if (!this.data) {
      this.transition('initializing:fallback');
      let bundled: DatafileInput | undefined;
      try {
        bundled = await this.bundledSource.tryLoad();
      } catch {
        // Bundled definitions not available — proceed without revision
      }
      if (this.state === 'shutdown') {
        throw new Error('@vercel/flags-core: Client is shut down');
      }
      if (bundled) this.data = tagData(bundled, 'bundled');
    }

    if (this.headerSource.isAvailable()) {
      this.transition('vercel');
      return;
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
      this.assertActive();
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
    this.assertActive();
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
    this.headerSource.stop();
    this.data = this.options.datafile
      ? tagData(this.options.datafile, 'provided')
      : undefined;
    this.transition('shutdown');
    await this.usageTracker.shutdown();
  }

  /**
   * Returns the datafile with metrics.
   * Applies the same runtime freshness policy as evaluation reads.
   */
  async getDatafile(): Promise<Datafile> {
    const startTime = Date.now();
    this.isFirstGetData = false;

    const [result, cacheStatus] = await this.resolveData();

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
   * Updating runtime: apply the shared freshness policy
   * Offline runtime: keep cached data or load static fallbacks
   */
  private async resolveData(): Promise<[TaggedData, Metrics['cacheStatus']]> {
    this.assertActive();
    if (this.options.buildStep) return this.resolveDataForBuildStep();

    // getDatafile() can be called before initialize(). Select the runtime mode
    // only after hydrating provided/bundled definitions, just like evaluate().
    const hadData = this.data !== undefined;
    if (this.state === 'idle' || this.initializationPromise)
      await this.initialize();
    this.assertActive();
    if (this.state === 'vercel') return this.resolveHeaderData();
    if (this.options.stream.enabled || this.options.polling.enabled) {
      return this.cachedData(this.isConnected ? 'HIT' : 'STALE');
    }
    if (this.data) return [this.data, hadData ? 'STALE' : 'MISS'];
    return this.resolveDataWithFallbacks();
  }

  private canServeCached(): boolean {
    const window = this.options.staleIfErrorMs;
    return (
      this.unhealthySince === undefined ||
      window === Infinity ||
      (window > 0 && Date.now() - this.unhealthySince <= window)
    );
  }

  private cachedData(
    status: Metrics['cacheStatus'],
  ): [TaggedData, Metrics['cacheStatus']] {
    this.assertActive();
    if (!this.data || !this.canServeCached()) {
      throw new Error(
        '@vercel/flags-core: No eligible flag definitions available',
      );
    }
    return [this.data, this.unhealthySince === undefined ? status : 'STALE'];
  }

  /** Header-specific revalidation stays independent of the outage grace period. */
  private async resolveHeaderData(): Promise<
    [TaggedData, Metrics['cacheStatus']]
  > {
    const requestVersion = this.headerSource.request();
    const required = requestVersion(this.data);
    if (this.data && this.headerSource.matches(this.data, required)) {
      this.unhealthySince = undefined;
    }
    if (
      this.data &&
      (required === undefined || Number(this.data.configUpdatedAt) >= required)
    ) {
      return this.cachedData(required === undefined ? 'STALE' : 'HIT');
    }
    if (
      this.data &&
      this.canServeCached() &&
      this.headerSource.canRevalidateInBackground(this.data)
    ) {
      this.refreshInBackground(requestVersion);
      return this.cachedData('STALE');
    }
    try {
      const data = await this.refreshHeader(requestVersion);
      this.assertActive();
      return [data, 'MISS'];
    } catch (error) {
      this.assertActive();
      if (this.data && this.canServeCached()) return this.cachedData('STALE');
      throw error;
    }
  }

  private async refreshHeader(
    requestVersion: (data: TaggedData | undefined) => number | undefined,
  ): Promise<TaggedData> {
    try {
      await this.headerSource.refresh();
      this.assertActive();
      const required = requestVersion(this.data);
      if (
        !this.data ||
        (required !== undefined &&
          !(Number(this.data.configUpdatedAt) >= required))
      ) {
        throw new Error(
          '@vercel/flags-core: Refresh did not satisfy the required version',
        );
      }
      return this.data;
    } catch (error) {
      this.markUnhealthy();
      throw error;
    }
  }

  private refreshInBackground(
    requestVersion: (data: TaggedData | undefined) => number | undefined,
  ): void {
    if (this.backgroundRefresh) return;
    const background = this.refreshHeader(requestVersion)
      .then(() => {})
      .catch((error) => {
        if (this.state !== 'shutdown') {
          console.error(
            '@vercel/flags-core: Background refresh failed:',
            error,
          );
        }
      })
      .finally(() => {
        if (this.backgroundRefresh === background)
          this.backgroundRefresh = undefined;
      });
    this.backgroundRefresh = background;
    try {
      this.options.waitUntil(background);
    } catch {
      // Registration is best-effort; the shared handled refresh continues.
    }
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
        this.markUnhealthy();
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
        this.markUnhealthy();
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
      this.markUnhealthy();
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
    this.pollingSource.startInterval();
    const pollPromise = this.pollingSource.poll();

    if (this.options.polling.initTimeoutMs <= 0) {
      try {
        const succeeded = await pollPromise;
        this.assertActive();
        if (succeeded && this.data) {
          this.pollingSource.startInterval();
          return true;
        }
        return false;
      } catch {
        this.markUnhealthy();
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
        this.markUnhealthy();
        console.warn(
          '@vercel/flags-core: Polling initialization timeout, falling back while continuing to poll in the background',
        );
        return false;
      }

      if (result && this.data) {
        this.pollingSource.startInterval();
        return true;
      }
      return false;
    } catch {
      this.markUnhealthy();
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
    this.assertActive();
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
    this.assertActive();
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
    this.assertActive();
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
