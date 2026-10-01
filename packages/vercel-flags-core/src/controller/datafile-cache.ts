import type { DatafileInput, Metrics, WaitUntil } from '../types';
import { type DataOrigin, type TaggedData, tagData } from './tagged-data';

type Confirmation = Pick<
  DatafileInput,
  'configUpdatedAt' | 'revision' | 'projectId' | 'environment'
>;

export type CacheMetadata = Confirmation & { ageMs: number };

export type Freshness = 'fresh' | 'stale' | 'expired' | 'unknown';

export type CacheAssessment = {
  status: Freshness;
  /** Positive evidence that renews age and clears the current failure. */
  confirmed?: boolean;
};

export type CacheFetch = (signal: AbortSignal) => Promise<DatafileInput>;
type CacheResult = [TaggedData, Metrics['cacheStatus']];
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

  constructor(
    private readonly fetch: CacheFetch,
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

  /** Stores initial or fallback data without confirming recovery from a failure. */
  seed(data: TaggedData): void {
    this.data = data;
    this.freshAt =
      typeof data.fetchedAt === 'number' &&
      Number.isFinite(data.fetchedAt) &&
      data.fetchedAt >= 0
        ? data.fetchedAt
        : undefined;
  }

  /** Accepts a source update or confirms the current version without replacing it. */
  updateFromSource(incoming: DatafileInput, origin: DataOrigin): void {
    if (this.isNewerData(incoming)) {
      this.data = tagData({ ...incoming, fetchedAt: Date.now() }, origin);
      this.confirm();
      if (origin === 'stream') {
        this.cancelFetch();
      }
      return;
    }
    if (this.tryConfirm(incoming) && origin === 'stream') {
      this.cancelFetch();
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
    return true;
  }

  /** Confirms the current cache state by clearing failures and resetting age. */
  confirm(): void {
    this.resetAge();
    this.failure = undefined;
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
    if (!this.canServe()) throw this.failure!.error;
    return this.data;
  }

  async resolve(policy: CacheReadPolicy): Promise<CacheResult | undefined> {
    const metadata = this.metadata;
    if (metadata) {
      const { status, confirmed } = policy.assess(metadata);
      // Apply recovery evidence before read() enforces the failure deadline.
      if (confirmed) this.confirm();
      if (status === 'fresh' || status === 'unknown') {
        // read() still enforces stale-if-error, even for a fresh assessment.
        return [
          this.read()!,
          status === 'fresh' && !this.failure ? 'HIT' : 'STALE',
        ];
      }

      if (this.failure) {
        if (!policy.retryOnFailure) return [this.read()!, 'STALE'];
        if (this.canServe()) {
          const stale = this.read()!;
          this.fetchInBackground();
          return [stale, 'STALE'];
        }
      }

      // If stale-if-error has expired, fall through to a blocking recovery fetch.
      // Calling read() here would throw before a background fetch could start.
      if (status === 'stale' && this.canServe()) {
        const stale = this.read()!;
        this.fetchInBackground();
        return [stale, 'STALE'];
      }
    }

    const { promise, signal } = this.startFetch('fetched');
    try {
      await promise;
      signal.throwIfAborted();
    } catch (error) {
      if (signal.aborted) {
        // A live source supplied current data while this read awaited HTTP.
        // Shutdown uses a different reason and must still reject the read.
        if (signal.reason === SOURCE_CONFIRMED && this.data) {
          return [this.read()!, 'HIT'];
        }
        throw error;
      }
      const stale = this.read();
      if (!stale) {
        throw error;
      }
      return [stale, 'STALE'];
    }

    // A cold fetch discovers the project; assess the original request's header.
    if (!metadata && this.metadata) {
      const { confirmed } = policy.assess(this.metadata);
      if (confirmed) this.confirm();
    }
    // Serve the accepted cache entry; the response may have contained older data.
    const data = this.read();
    if (!data)
      throw new Error('@vercel/flags-core: Fetch returned no definitions');
    return [data, 'MISS'];
  }

  /** Runs the one shared datafile refresh used by reads and polling. */
  refresh(origin: DataOrigin = 'fetched'): Promise<void> {
    return this.startFetch(origin).promise;
  }

  private startFetch(origin: DataOrigin) {
    const { signal } = this.abortController;
    // Share the fetch, but let each caller assess its own request's headers.
    if (this.fetching) return { promise: this.fetching, signal };

    const promise = Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return this.fetch(signal);
      })
      .then((data) => {
        signal.throwIfAborted();
        this.updateFromSource(data, origin);
      })
      .catch((error) => {
        signal.throwIfAborted();
        const err =
          error instanceof Error ? error : new Error('Unknown fetch error');
        this.fail(err);
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

  /** Clearing storage is not recovery; restored seeds keep the failure deadline. */
  clear(): void {
    this.abortController.abort();
    this.abortController = new AbortController();
    this.fetching = undefined;
    this.data = undefined;
    this.freshAt = undefined;
  }

  /** Retire superseded HTTP work without discarding the accepted snapshot. */
  cancelFetch(): void {
    if (this.fetching) {
      this.abortController.abort(SOURCE_CONFIRMED);
      this.abortController = new AbortController();
      this.fetching = undefined;
    }
  }
}
