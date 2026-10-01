import type { DatafileInput, Metrics, WaitUntil } from '../types';
import { debug } from './debug';
import { type DataOrigin, type TaggedData, tagData } from './tagged-data';

type Confirmation = Pick<
  DatafileInput,
  'configUpdatedAt' | 'revision' | 'projectId' | 'environment'
>;
type ConfirmationSource = DataOrigin | 'header';

export type CacheMetadata = Confirmation & { ageMs: number };

export type Freshness = 'fresh' | 'stale' | 'expired' | 'unknown';

export type CacheAssessment = {
  /** Error means the source cannot assess this entry; the controller must fall back. */
  status: Freshness | 'error';
  /** Positive evidence that renews age and clears the current failure. */
  confirmed?: boolean;
};

export type CacheFetch = (signal: AbortSignal) => Promise<DatafileInput>;
export type CacheResult = {
  data: TaggedData | undefined;
  status: Metrics['cacheStatus'];
  hasError?: boolean;
};

const SOURCE_CONFIRMED = new Error(
  'Refresh superseded by a source confirmation',
);

export type CacheReadPolicy = {
  /** Unknown adds no freshness evidence and keeps cached-read behavior. */
  assess: (data: CacheMetadata) => CacheAssessment;
  /** Header reads can provide new recovery evidence before a source update. */
  retryOnFailure?: boolean;
};

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

/** Storage, serving policy, and fetching driven by source callbacks. */
export class DatafileCache {
  private data: TaggedData | undefined;
  // Confirmations refresh age without rewriting the datafile's persisted fetch time.
  private freshAt: number | undefined;
  private failure: { error: Error; startedAt: number } | undefined;

  private abortController = new AbortController();
  private fetching: Promise<void> | undefined;

  private debugState = () => ({
    projectId: this.data?.projectId,
    environment: this.data?.environment,
    hasData: this.hasData,
    origin: this.data?._origin,
    revision: this.revision,
    configUpdatedAt: parseConfigUpdatedAt(this.data?.configUpdatedAt),
    ageMs: this.ageMs,
    failed: this.failure !== undefined,
    failureAgeMs: this.failure
      ? Date.now() - this.failure.startedAt
      : undefined,
    staleIfErrorMs: this.staleIfErrorMs,
    canServe: this.hasData && this.canServe(),
    fetching: this.fetching !== undefined,
  });

  constructor(
    private readonly fetch: CacheFetch,
    private readonly staleIfErrorMs = Infinity,
    private readonly waitUntil: WaitUntil = () => {},
    private readonly clientName?: string,
  ) {}

  /** Expired data still exists; fallback loading must not bypass its failure policy. */
  get hasData(): boolean {
    return this.data !== undefined;
  }

  /** Retained revisions remain available for reconnecting after serving expires. */
  get revision(): number | undefined {
    return this.data?.revision;
  }

  /** Time since the latest freshness evidence, if known. */
  get ageMs(): number {
    return this.freshAt === undefined
      ? Infinity
      : Math.max(0, Date.now() - this.freshAt);
  }

  /** Records freshness evidence without confirming recovery from a failure. */
  resetAge(): void {
    if (this.data) this.freshAt = Date.now();
  }

  /** Freshness checks can inspect retained metadata even after serving expires. */
  public get metadata(): CacheMetadata | undefined {
    if (!this.data) return undefined;
    const { projectId, environment, configUpdatedAt, revision } = this.data;
    return {
      projectId,
      environment,
      configUpdatedAt,
      revision,
      ageMs: this.ageMs,
    };
  }

  /** Stores initial or fallback data without confirming recovery from a failure. */
  seed(data: TaggedData): void {
    this.data = data;
    this.freshAt =
      typeof data.fetchedAt === 'number' &&
      Number.isFinite(data.fetchedAt) &&
      data.fetchedAt >= 0
        ? data.fetchedAt
        : undefined;
    debug(this.clientName, 'cache.seed', this.debugState);
  }

  /** Stores data and returns it through the serving boundary. */
  seedAndRead(data: TaggedData): TaggedData {
    this.seed(data);
    const seeded = this.read();
    if (!seeded) {
      throw new Error('@vercel/flags-core: Seeded definitions unavailable');
    }
    return seeded;
  }

  /**
   * Accepts a newer source response, or keeps the stored data when the version
   * guard rejects it. Every successful response proves the source is reachable,
   * so it renews cache age and clears the failure either way.
   */
  updateFromSource(incoming: DatafileInput, origin: DataOrigin): void {
    if (this.isNewerData(incoming)) {
      this.data = tagData({ ...incoming, fetchedAt: Date.now() }, origin);
      this.confirm(origin);
      debug(this.clientName, 'cache.update.accepted', this.debugState);
      return;
    }
    this.confirm(origin);
    debug(this.clientName, 'cache.update.ignored', () => ({
      ...this.debugState(),
      incomingOrigin: origin,
      incomingRevision: incoming.revision,
      incomingConfigUpdatedAt: parseConfigUpdatedAt(incoming.configUpdatedAt),
    }));
  }

  /** Confirms a same-version message without replacing stored data. */
  tryConfirm(
    incoming: Confirmation,
    version: 'configUpdatedAt' | 'revision' = 'configUpdatedAt',
    source: ConfirmationSource = 'header',
  ): boolean {
    if (!this.matchesStored(incoming, version)) {
      return false;
    }

    this.confirm(source);
    debug(this.clientName, 'cache.confirmed', () => ({
      version,
      source,
      ...this.debugState(),
    }));
    return true;
  }

  /** Whether a message refers to the stored entry: finite equal version and same identity. */
  private matchesStored(
    incoming: Confirmation,
    version: 'configUpdatedAt' | 'revision',
  ): boolean {
    if (!this.data) {
      return false;
    }

    const currentTs =
      version === 'revision'
        ? this.data.revision
        : parseConfigUpdatedAt(this.data.configUpdatedAt);
    const incomingTs =
      version === 'revision'
        ? incoming.revision
        : parseConfigUpdatedAt(incoming.configUpdatedAt);
    return (
      Number.isFinite(currentTs) &&
      Number.isFinite(incomingTs) &&
      currentTs === incomingTs &&
      this.data.projectId === incoming.projectId &&
      this.data.environment === incoming.environment
    );
  }

  /** Renews freshness and retires HTTP work superseded by stream evidence. */
  confirm(source: ConfirmationSource = 'header'): void {
    const recovered = this.failure !== undefined;
    this.resetAge();
    this.failure = undefined;
    if (recovered) {
      debug(this.clientName, 'cache.recovered', this.debugState);
    }
    // HTTP responses must finish their own refresh; headers may be older requests.
    if (source === 'stream' && this.fetching) {
      debug(this.clientName, 'cache.fetch.cancel', () => ({
        reason: 'source-confirmed',
        ...this.debugState(),
      }));
      this.abortController.abort(SOURCE_CONFIRMED);
      this.abortController = new AbortController();
      this.fetching = undefined;
    }
  }

  /** Preserves existing acceptance, including missing or unparseable versions. */
  private isNewerData(incoming: DatafileInput): boolean {
    if (!this.data) return true;

    const currentTs = parseConfigUpdatedAt(this.data.configUpdatedAt);
    const incomingTs = parseConfigUpdatedAt(incoming.configUpdatedAt);

    if (currentTs === undefined || incomingTs === undefined) {
      return true;
    }

    return incomingTs > currentTs;
  }

  fail(error: Error): void {
    const repeated = this.failure !== undefined;
    // Repeated failures must not keep extending the stale-if-error allowance.
    this.failure ??= { error, startedAt: Date.now() };
    debug(this.clientName, 'cache.failure', () => ({
      repeated,
      ...this.debugState(),
    }));
  }

  private canServe(): boolean {
    if (!this.failure || this.staleIfErrorMs === Infinity) return true;
    return (
      this.staleIfErrorMs > 0 &&
      Date.now() - this.failure.startedAt <= this.staleIfErrorMs
    );
  }

  /** The serving boundary for both snapshot and policy-driven reads. */
  read(): TaggedData | undefined {
    if (!this.data) return undefined;
    if (!this.canServe()) {
      debug(this.clientName, 'cache.stale-if-error.expired', this.debugState);
      throw this.failure!.error;
    }
    return this.data;
  }

  async resolve(policy: CacheReadPolicy): Promise<CacheResult> {
    const metadata = this.metadata;
    if (metadata) {
      const { status, confirmed } = policy.assess(metadata);
      if (status === 'error') {
        debug(this.clientName, 'cache.source-error', this.debugState);
        // Source availability is not a fetch failure. Preserve the failure deadline
        // and report the source error even when retained data can no longer be served.
        return {
          data: this.canServe() ? this.read() : undefined,
          status: 'STALE',
          hasError: true,
        };
      }
      // Apply recovery evidence before read() enforces the failure deadline.
      if (confirmed) this.confirm();
      debug(this.clientName, 'cache.freshness', () => ({
        status,
        confirmed: confirmed === true,
        ...this.debugState(),
      }));
      if (status === 'fresh' || status === 'unknown') {
        // read() still enforces stale-if-error, even for a fresh assessment.
        return {
          data: this.read(),
          status: status === 'fresh' && !this.failure ? 'HIT' : 'STALE',
        };
      }

      if (this.failure) {
        if (!policy.retryOnFailure) {
          debug(this.clientName, 'cache.stale-if-error', () => ({
            ...this.debugState(),
            recovery: 'scheduled-source-update',
          }));
          return { data: this.read(), status: 'STALE' };
        }
        if (this.canServe()) {
          const stale = this.read();
          debug(this.clientName, 'cache.refresh.background', () => ({
            ...this.debugState(),
            reason: 'retry-after-failure',
          }));
          this.fetchInBackground();
          return { data: stale, status: 'STALE' };
        }
      }

      // If stale-if-error has expired, fall through to a blocking recovery fetch.
      // Calling read() here would throw before a background fetch could start.
      if (status === 'stale' && this.canServe()) {
        const stale = this.read();
        debug(this.clientName, 'cache.refresh.background', () => ({
          ...this.debugState(),
          reason: 'stale',
        }));
        this.fetchInBackground();
        return { data: stale, status: 'STALE' };
      }
    }

    debug(this.clientName, 'cache.refresh.blocking', () => ({
      ...this.debugState(),
      reason: !metadata ? 'empty-cache' : 'expired',
    }));
    const { promise, signal } = this.startFetch('fetched');
    try {
      await promise;
      signal.throwIfAborted();
    } catch (error) {
      if (signal.aborted) {
        // A live source supplied current data while this read awaited HTTP.
        // Shutdown uses a different reason and must still reject the read.
        if (signal.reason === SOURCE_CONFIRMED && this.data) {
          debug(this.clientName, 'cache.refresh.superseded', this.debugState);
          return { data: this.read(), status: 'HIT' };
        }
        throw error;
      }
      const stale = this.read();
      if (!stale) {
        throw error;
      }
      debug(this.clientName, 'cache.stale-if-error', () => ({
        ...this.debugState(),
        recovery: 'refresh-failed',
      }));
      return { data: stale, status: 'STALE' };
    }

    // Record the original request's evidence once a cold fetch discovers metadata.
    // The fetched data serves this read; source availability is checked on the next.
    if (!metadata && this.metadata) {
      const { confirmed } = policy.assess(this.metadata);
      if (confirmed) this.confirm();
    }
    // Serve the accepted cache entry; the response may have contained older data.
    const data = this.read();
    if (!data) {
      throw new Error('@vercel/flags-core: Fetch returned no definitions');
    }
    return { data, status: 'MISS' };
  }

  /** Runs the one shared datafile refresh used by reads and polling. */
  refresh(origin: DataOrigin = 'fetched'): Promise<void> {
    return this.startFetch(origin).promise;
  }

  private startFetch(origin: DataOrigin) {
    const { signal } = this.abortController;
    // Share the fetch, but let each caller assess its own request's headers.
    if (this.fetching) {
      debug(this.clientName, 'cache.fetch.shared', () => ({
        requestedOrigin: origin,
        ...this.debugState(),
      }));
      return { promise: this.fetching, signal };
    }
    debug(this.clientName, 'cache.fetch.start', () => ({
      requestedOrigin: origin,
      ...this.debugState(),
    }));

    const promise = Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return this.fetch(signal);
      })
      .then((data) => {
        signal.throwIfAborted();
        this.updateFromSource(data, origin);
        debug(this.clientName, 'cache.fetch.applied', this.debugState);
      })
      .catch((error) => {
        if (signal.aborted) {
          debug(this.clientName, 'cache.fetch.aborted', () => ({
            reason:
              signal.reason === SOURCE_CONFIRMED
                ? 'source-confirmed'
                : 'cache-cleared',
          }));
        }
        signal.throwIfAborted();
        const err =
          error instanceof Error ? error : new Error('Unknown fetch error');
        this.fail(err);
        debug(this.clientName, 'cache.fetch.failed', this.debugState);
        throw err;
      })
      .finally(() => {
        // An old, aborted operation must not clear a newer one.
        if (this.abortController.signal === signal) {
          this.fetching = undefined;
        }
      });
    this.fetching = promise;
    return { promise, signal };
  }

  private fetchInBackground(): void {
    const { promise, signal } = this.startFetch('fetched');
    const background = promise.catch((error) => {
      if (!signal.aborted) {
        console.error('@vercel/flags-core: Revalidation failed:', error);
      }
    });
    try {
      this.waitUntil(background);
    } catch {
      // Registration is best-effort; the handled refresh continues regardless.
    }
  }

  /** Resets storage, age, and the failure deadline so a restarted client begins clean. */
  clear(): void {
    debug(this.clientName, 'cache.clear', this.debugState);
    this.abortController.abort();
    this.abortController = new AbortController();
    this.fetching = undefined;
    this.data = undefined;
    this.freshAt = undefined;
    this.failure = undefined;
  }
}
