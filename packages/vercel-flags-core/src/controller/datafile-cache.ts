import type { DatafileInput, Metrics, WaitUntil } from '../types';
import { type DataOrigin, type TaggedData, tagData } from './tagged-data';

type Confirmation = Pick<
  DatafileInput,
  'configUpdatedAt' | 'revision' | 'projectId' | 'environment'
>;

export type CacheMetadata = Confirmation & Pick<DatafileInput, 'fetchedAt'>;

type Revalidate = (signal: AbortSignal) => Promise<void>;
type CacheResult = [TaggedData, Metrics['cacheStatus']];

export type CacheReadPolicy = {
  /** Undefined adds no freshness evidence and keeps cached-read behavior. */
  isFresh: (data: CacheMetadata) => boolean | undefined;
  /** Whether stale data may be served while revalidation runs. */
  isStale: (data: CacheMetadata) => boolean;
  /** Omit for modes whose stream/poll loop already maintains the cache. */
  revalidate?: Revalidate;
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

/** Storage, serving policy, and revalidation driven by source callbacks. */
export class DatafileCache {
  private data: TaggedData | undefined;
  private failure: { error: Error; startedAt: number } | undefined;

  private abortController = new AbortController();
  private revalidation: Promise<void> | undefined;

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

  /** Freshness checks can inspect retained metadata even after serving expires. */
  private get metadata(): CacheMetadata | undefined {
    if (!this.data) return undefined;
    const { projectId, environment, configUpdatedAt, revision, fetchedAt } =
      this.data;
    return { projectId, environment, configUpdatedAt, revision, fetchedAt };
  }

  /** Stores initial or fallback data without confirming recovery from a failure. */
  seed(data: TaggedData): void {
    this.data = data;
  }

  /** Accepts a source update or confirms the current version without replacing it. */
  updateFromSource(incoming: DatafileInput, origin: DataOrigin): void {
    if (this.isNewerData(incoming)) {
      this.data = tagData(incoming, origin);
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

    this.failure = undefined;
    return true;
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
    const metadata = this.metadata;
    if (metadata) {
      const fresh = policy.isFresh(metadata);
      if (fresh !== false || !policy.revalidate) {
        return [this.read()!, fresh ? 'HIT' : 'STALE'];
      }
      if (policy.isStale(metadata) && this.canServe()) {
        const stale = this.read()!;
        this.revalidateInBackground(policy.revalidate);
        return [stale, 'STALE'];
      }
    }

    if (!policy.revalidate) return;
    const { promise, signal } = this.startRevalidation(policy.revalidate);
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
    if (!metadata && this.metadata) policy.isFresh(this.metadata);
    const data = this.read();
    if (!data)
      throw new Error(
        '@vercel/flags-core: Revalidation returned no definitions',
      );
    return [data, 'MISS'];
  }

  private startRevalidation(revalidate: Revalidate) {
    const { signal } = this.abortController;
    if (this.revalidation) return { promise: this.revalidation, signal };

    const promise = Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return revalidate(signal);
      })
      .then(() => signal.throwIfAborted())
      .catch((error) => {
        if (!signal.aborted) {
          this.fail(
            error instanceof Error
              ? error
              : new Error('Unknown revalidation error'),
          );
        }
        throw error;
      })
      .finally(() => {
        // An old, aborted operation must not clear a newer one.
        if (this.abortController.signal === signal)
          this.revalidation = undefined;
      });
    this.revalidation = promise;
    return { promise, signal };
  }

  private revalidateInBackground(revalidate: Revalidate): void {
    const { promise, signal } = this.startRevalidation(revalidate);
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
    this.revalidation = undefined;
    this.data = undefined;
  }
}
