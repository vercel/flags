import type { DatafileInput, Metrics, WaitUntil } from '../types';
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
  private freshAt: number | undefined;
  private failure: { error: Error; startedAt: number } | undefined;

  private abortController = new AbortController();
  private fetching: Promise<void> | undefined;

  constructor(
    private readonly staleIfErrorMs = Infinity,
    private readonly waitUntil: WaitUntil = () => {},
  ) {}

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
      this.data = tagData(incoming, origin);
      this.resetAge();
      this.failure = undefined;
      return;
    }
    this.tryConfirm(incoming);
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
    // Expired entries can still recover through confirmation or a blocking fetch.
    const metadata = this.metadata;
    if (metadata) {
      const status = policy.getStatus(metadata);
      if (status === 'fresh' || status === 'unknown' || !policy.fetch) {
        return [this.read()!, status === 'fresh' ? 'HIT' : 'STALE'];
      }

      if (status === 'stale' && this.canServe()) {
        const stale = this.read()!;
        this.fetchInBackground(policy.fetch);
        return [stale, 'STALE'];
      }
    }

    if (!policy.fetch) return;

    const { promise, signal } = this.startFetch(policy.fetch);
    try {
      await promise;
      signal.throwIfAborted();
    } catch (error) {
      if (signal.aborted) throw error;
      const stale = this.read();
      if (!stale) throw error;
      return [stale, 'STALE'];
    }

    // A cold fetch discovers the project; assess the original request's header.
    if (!metadata && this.metadata) policy.getStatus(this.metadata);
    const data = this.read();
    if (!data)
      throw new Error('@vercel/flags-core: Fetch returned no definitions');
    return [data, 'MISS'];
  }

  private startFetch(fetch: Fetch) {
    const { signal } = this.abortController;
    if (this.fetching) return { promise: this.fetching, signal };

    const promise = Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return fetch(signal);
      })
      .then(() => signal.throwIfAborted())
      .catch((error) => {
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

  clear(): void {
    this.abortController.abort();
    this.abortController = new AbortController();
    this.fetching = undefined;
    this.data = undefined;
    this.freshAt = undefined;
  }
}
