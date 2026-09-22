import type { TaggedData } from './tagged-data';

/** A new token for each stored snapshot, even if the data object is reused. */
export type CacheEntry = Readonly<{
  data: TaggedData;
}>;

/** Storage and failure-relative read policy; callers provide source evidence. */
export class DatafileCache {
  private entry: CacheEntry | undefined;
  private failure: { error: Error; startedAt: number } | undefined;

  peek(): CacheEntry | undefined {
    return this.entry;
  }

  set(data: TaggedData): TaggedData {
    this.entry = { data };
    return data;
  }

  confirm(snapshot: CacheEntry | undefined): void {
    if (snapshot && snapshot === this.entry) {
      this.failure = undefined;
    }
  }

  fail(error: Error): void {
    this.failure ??= { error, startedAt: Date.now() };
  }

  read(staleIfErrorMs: number): TaggedData | undefined {
    if (!this.entry) return undefined;

    if (!this.failure || staleIfErrorMs === Infinity) return this.entry.data;

    const withinAllowance =
      staleIfErrorMs > 0 &&
      Date.now() - this.failure.startedAt <= staleIfErrorMs;
    if (!withinAllowance) {
      throw this.failure.error;
    }
    return this.entry.data;
  }

  clear(): void {
    this.entry = undefined;
  }
}
