import type { DatafileInput } from '../types';
import { getRequestContext } from '../utils/request-context';
import type { CacheMetadata, CacheReadPolicy } from './datafile-cache';
import { fetchDatafile } from './fetch-datafile';
import type { NormalizedOptions } from './normalized-options';
import { TypedEmitter } from './typed-emitter';

export type HeaderSourceEvents = {
  data: (data: DatafileInput) => void;
  confirmed: (data: CacheMetadata) => void;
};

/** Request version evidence and fetching; the cache decides how to serve reads. */
export class HeaderSource extends TypedEmitter<HeaderSourceEvents> {
  private highestObserved = 0;
  private lastSeen: { version: number; at: number } | undefined;

  constructor(private readonly options: NormalizedOptions) {
    super();
  }

  /** Capture this request's header before any cold-cache fetch awaits. */
  getFreshnessCheck(): CacheReadPolicy['isFresh'] {
    const { headers } = getRequestContext();
    const header =
      headers?.['x-vercel-flags-config-versions'] ??
      headers?.['flags-config-versions'];
    return (data) => this.isFresh(data, header);
  }

  private getUpdatedAtHeader(projectId: string, header: string | undefined) {
    if (!header) return;

    const prefix = `flags_${projectId}=`;
    const value = header
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
  }

  private isFresh(
    data: CacheMetadata,
    header: string | undefined,
  ): boolean | undefined {
    const version = this.getUpdatedAtHeader(data.projectId, header);
    if (!version) return;

    const currentVersion = Number(data.configUpdatedAt);
    this.highestObserved = Math.max(this.highestObserved, version);
    // An older matching request cannot undo a newer request's invalidation.
    if (version === currentVersion && version === this.highestObserved) {
      this.lastSeen = { version, at: Date.now() };
      this.emit('confirmed', data);
    }

    if (!data.configUpdatedAt) return;
    return version <= currentVersion;
  }

  /** Whether this version is still inside its background-refresh window. */
  isStale = (data: CacheMetadata): boolean => {
    const freshAt = Math.max(
      data.fetchedAt ?? -Infinity,
      this.lastSeen?.version === Number(data.configUpdatedAt)
        ? this.lastSeen.at
        : -Infinity,
    );
    const { staleWhileRevalidateMs } = this.options;
    return (
      staleWhileRevalidateMs > 0 &&
      Date.now() - freshAt <= staleWhileRevalidateMs
    );
  };

  revalidate = async (signal: AbortSignal): Promise<void> => {
    const data = await fetchDatafile({ ...this.options, signal });
    // Transports can finish after cancellation; never publish that response.
    signal.throwIfAborted();
    this.emit('data', data);
  };

  isAvailable(): boolean {
    // Explicit offline mode disables header-driven refreshes too.
    return (
      this.options.vercel &&
      (this.options.stream.enabled || this.options.polling.enabled)
    );
  }

  stop(): void {
    this.lastSeen = undefined;
    this.highestObserved = 0;
  }
}
