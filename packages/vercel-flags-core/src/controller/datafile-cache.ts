import type { TaggedData } from './tagged-data';

/** A new token for each stored snapshot, even if the data object is reused. */
export type CacheEntry = Readonly<{
  data: TaggedData;
  fetchedAt?: number;
}>;

/** Evidence applies only to the snapshot that was assessed. */
export type FreshnessAssessment = {
  snapshot: CacheEntry | undefined;
  needsRefresh: boolean;
  confirmedAt?: number;
};

type CacheRead =
  | { data: TaggedData; refresh: 'none' | 'background' }
  | { data?: undefined; refresh: 'blocking' };

/** Storage and read policy only; callers own source health and fetching. */
export class DatafileCache {
  private entry: CacheEntry | undefined;

  peek(): CacheEntry | undefined {
    return this.entry;
  }

  set(data: TaggedData): TaggedData {
    const fromNetwork =
      data._origin === 'poll' ||
      data._origin === 'stream' ||
      data._origin === 'fetched';
    this.entry = { data, fetchedAt: fromNetwork ? Date.now() : undefined };
    return data;
  }

  read(
    assessment: FreshnessAssessment,
    options: {
      error?: Error;
      staleIfErrorMs?: number;
      staleWhileRevalidateMs?: number;
    } = {},
  ): CacheRead {
    const cached = this.entry;
    if (!cached) return { refresh: 'blocking' };

    const sameSnapshot = assessment.snapshot === cached;
    if (sameSnapshot && !assessment.needsRefresh) {
      return { data: cached.data, refresh: 'none' };
    }

    const freshAt = Math.max(
      cached.fetchedAt ?? -Infinity,
      sameSnapshot ? (assessment.confirmedAt ?? -Infinity) : -Infinity,
    );
    if (!options.error && !Number.isFinite(freshAt)) {
      return { refresh: 'blocking' };
    }
    const windowMs = options.error
      ? (options.staleIfErrorMs ?? Infinity)
      : (options.staleWhileRevalidateMs ?? 0);
    const canServeStale =
      windowMs > 0 &&
      (windowMs === Infinity || Date.now() - freshAt <= windowMs);
    if (canServeStale) return { data: cached.data, refresh: 'background' };
    if (options.error) throw options.error;
    return { refresh: 'blocking' };
  }

  clear(): void {
    this.entry = undefined;
  }
}
