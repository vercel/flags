import type { DatafileInput, Metrics, WaitUntil } from '../types';
import { debug } from './debug';
import { type DataOrigin, type TaggedData, tagData } from './tagged-data';

type Confirmation = Pick<
  DatafileInput,
  'configUpdatedAt' | 'revision' | 'projectId' | 'environment'
>;

export type CacheMetadata = Confirmation & { ageMs: number };

export type Freshness = 'fresh' | 'stale' | 'expired' | 'unknown';

type Fetch = (signal: AbortSignal) => Promise<void>;
type CacheResult = [TaggedData, Metrics['cacheStatus']];

export type CacheReadPolicy = {
  /** Unknown adds no freshness evidence and keeps cached-read behavior. */
  getStatus: (data: CacheMetadata) => Freshness;
  /** Omit for modes whose stream/poll loop already maintains the cache. */
  fetch?: Fetch;
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

  constructor(
    private readonly staleIfErrorMs = Infinity,
    private readonly waitUntil: WaitUntil = () => {},
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

  private debugState = () => ({
    hasData: this.hasData,
    origin: this.data?._origin,
    revision: this.revision,
    configUpdatedAt: parseConfigUpdatedAt(this.data?.configUpdatedAt),
    ageMs: this.ageMs,
    failed: this.failure !== undefined,
    failureAgeMs: this.failure
      ? Date.now() - this.failure.startedAt
      : undefined,
    canServe: this.canServe(),
    fetching: this.fetching !== undefined,
  });

  /** Stores initial or fallback data without confirming recovery from a failure. */
  seed(data: TaggedData): void {
    this.data = data;
    this.freshAt =
      typeof data.fetchedAt === 'number' &&
      Number.isFinite(data.fetchedAt) &&
      data.fetchedAt >= 0
        ? data.fetchedAt
        : undefined;
    debug('cache.seed', this.debugState);
  }

  /** Accepts a source update or confirms the current version without replacing it. */
  updateFromSource(incoming: DatafileInput, origin: DataOrigin): void {
    if (this.isNewerData(incoming)) {
      this.data = tagData(incoming, origin);
      this.resetAge();
      this.failure = undefined;
      debug('cache.update.accepted', this.debugState);
      return;
    }
    if (!this.tryConfirm(incoming)) {
      debug('cache.update.ignored', () => ({
        ...this.debugState(),
        incomingConfigUpdatedAt: parseConfigUpdatedAt(incoming.configUpdatedAt),
        incomingRevision: incoming.revision,
        incomingOrigin: origin,
      }));
    }
  }

  /** Confirms a same-version source response without replacing stored data. */
  tryConfirm(
    incoming: Confirmation,
    version: 'configUpdatedAt' | 'revision' = 'configUpdatedAt',
  ): boolean {
    if (!this.data) return false;

    const currentTs =
      version === 'revision'
        ? this.data.revision
        : parseConfigUpdatedAt(this.data.configUpdatedAt);
    const incomingTs =
      version === 'revision'
        ? incoming.revision
        : parseConfigUpdatedAt(incoming.configUpdatedAt);
    if (
      !Number.isFinite(currentTs) ||
      !Number.isFinite(incomingTs) ||
      currentTs !== incomingTs ||
      this.data.projectId !== incoming.projectId ||
      this.data.environment !== incoming.environment
    ) {
      return false;
    }

    this.confirm();
    debug('cache.confirmed', () => ({ version, ...this.debugState() }));
    return true;
  }

  /** Confirms the current cache state by clearing failures and resetting age. */
  confirm(): void {
    this.resetAge();
    this.failure = undefined;
    debug('cache.recovered', this.debugState);
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
    // Repeated failures must not keep extending the stale-if-error allowance.
    this.failure ??= { error, startedAt: Date.now() };
    debug('cache.failure', this.debugState);
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
      debug('cache.read.expired', this.debugState);
      throw this.failure!.error;
    }
    return this.data;
  }

  async resolve(policy: CacheReadPolicy): Promise<CacheResult | undefined> {
    const metadata = this.metadata;
    if (metadata) {
      // The assessment may confirm recovery, so run it before read() checks failure.
      const status = policy.getStatus(metadata);
      debug('cache.freshness', () => ({ status, ...this.debugState() }));
      if (status === 'fresh' || status === 'unknown' || !policy.fetch) {
        // Stream/poll omit fetch because they maintain the cache independently.
        // read() still enforces stale-if-error, even for a fresh assessment.
        return [this.read()!, status === 'fresh' ? 'HIT' : 'STALE'];
      }

      // If stale-if-error has expired, fall through to a blocking recovery fetch.
      // Calling read() here would throw before a background fetch could start.
      if (status === 'stale' && this.canServe()) {
        const stale = this.read()!;
        debug('cache.refresh.background', this.debugState);
        this.fetchInBackground(policy.fetch);
        return [stale, 'STALE'];
      }
    }

    if (!policy.fetch) {
      debug('cache.empty', this.debugState);
      return;
    }

    debug('cache.refresh.blocking', this.debugState);

    const { promise, signal } = this.startFetch(policy.fetch);
    try {
      await promise;
      signal.throwIfAborted();
    } catch (error) {
      if (signal.aborted) throw error;
      const stale = this.read();
      if (!stale) throw error;
      debug('cache.stale-if-error', this.debugState);
      return [stale, 'STALE'];
    }

    // A cold fetch discovers the project; assess the original request's header.
    if (!metadata && this.metadata) policy.getStatus(this.metadata);
    // Serve the accepted cache entry; the response may have contained older data.
    const data = this.read();
    if (!data)
      throw new Error('@vercel/flags-core: Fetch returned no definitions');
    return [data, 'MISS'];
  }

  private startFetch(fetch: Fetch) {
    const { signal } = this.abortController;
    // Share the fetch, but let each caller assess its own request's headers.
    if (this.fetching) {
      debug('cache.fetch.shared');
      return { promise: this.fetching, signal };
    }
    debug('cache.fetch.start');

    const promise = Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return fetch(signal);
      })
      .then(() => {
        signal.throwIfAborted();
        debug('cache.fetch.complete', this.debugState);
      })
      .catch((error) => {
        debug(signal.aborted ? 'cache.fetch.aborted' : 'cache.fetch.failed');
        if (!signal.aborted) {
          this.fail(
            error instanceof Error ? error : new Error('Unknown fetch error'),
          );
        }
        throw error;
      })
      .finally(() => {
        // An old, aborted operation must not clear a newer one.
        if (this.abortController.signal === signal) this.fetching = undefined;
      });
    this.fetching = promise;
    return { promise, signal };
  }

  private fetchInBackground(fetch: Fetch): void {
    const { promise, signal } = this.startFetch(fetch);
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

  /** Switching sources cancels revalidation without changing storage or failure. */
  cancelFetch(): void {
    debug('cache.fetch.cancel', this.debugState);
    this.abortController.abort();
    this.abortController = new AbortController();
    this.fetching = undefined;
  }

  /** Clearing storage is not recovery; restored seeds keep the failure deadline. */
  clear(): void {
    debug('cache.clear', this.debugState);
    this.cancelFetch();
    this.data = undefined;
    this.freshAt = undefined;
  }
}
