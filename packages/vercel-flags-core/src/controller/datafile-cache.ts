import type { TaggedData } from './tagged-data';

type Freshness =
  | { status: 'unknown' | 'fresh' }
  | { status: 'unavailable'; since: number; error: Error };

/** The authoritative tagged snapshot, shared by every controller mode. */
export class DatafileCache {
  private data: TaggedData | undefined;
  private freshness: Freshness = { status: 'unknown' };

  get(): TaggedData | undefined {
    return this.data;
  }

  // Storage changes (including fallback seeds) do not confirm freshness.
  set(data: TaggedData): TaggedData {
    this.data = data;
    return data;
  }

  confirm(): void {
    this.freshness = { status: 'fresh' };
  }

  fail(error: Error): void {
    if (this.freshness.status === 'unavailable') return;
    this.freshness = { status: 'unavailable', since: Date.now(), error };
  }

  assertUsable(staleIfErrorMs: number): void {
    if (this.freshness.status !== 'unavailable') return;
    if (staleIfErrorMs === Infinity) return;
    const elapsed = Date.now() - this.freshness.since;
    if (staleIfErrorMs > 0 && elapsed <= staleIfErrorMs) return;
    throw this.freshness.error;
  }

  // Clearing storage is not recovery evidence either.
  clear(): void {
    this.data = undefined;
  }
}
