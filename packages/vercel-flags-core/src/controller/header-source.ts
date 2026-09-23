import type { BundledDefinitions, DatafileInput, Metrics } from '../types';
import { getRequestContext } from '../utils/request-context';
import type { CacheMetadata, DatafileCache } from './datafile-cache';
import { fetchDatafile } from './fetch-datafile';
import type { NormalizedOptions } from './normalized-options';
import type { TaggedData } from './tagged-data';
import { TypedEmitter } from './typed-emitter';

export type HeaderSourceEvents = {
  data: (data: DatafileInput) => void;
  error: (error: Error) => void;
};

/**
 * Manages a lazy pulling of flag data from the flags service using the version header.
 */
export class HeaderSource extends TypedEmitter<HeaderSourceEvents> {
  private options: NormalizedOptions;
  private abortController: AbortController | undefined;
  private promise: Promise<BundledDefinitions> | undefined;
  private highestObserved = 0;
  private lastSeen: { version: number; at: number } | undefined;

  constructor(options: NormalizedOptions) {
    super();

    this.options = options;
  }

  private fetchDatafile(): Promise<BundledDefinitions> {
    // Share only the transport work, not request-specific freshness decisions.
    if (this.promise) return this.promise;

    const abortController = new AbortController();
    this.abortController = abortController;
    this.promise = fetchDatafile({
      ...this.options,
      signal: abortController.signal,
    })
      .then((data) => {
        // A transport may finish after stop() even if it ignores cancellation.
        abortController.signal.throwIfAborted();
        this.emit('data', data);
        return data;
      })
      .catch((error) => {
        if (!abortController.signal.aborted) this.emit('error', error);
        throw error;
      })
      .finally(() => {
        // An older, aborted fetch must not clear a newer request's work.
        if (this.abortController === abortController) {
          this.promise = undefined;
          this.abortController = undefined;
        }
      });

    return this.promise;
  }

  private getUpdatedAtHeader(projectId: string, header: string | undefined) {
    if (!header) {
      return;
    }

    const prefix = `flags_${projectId}=`;
    const value = header
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);
    const timestamp = Number(value);

    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
  }

  private async refresh(
    cache: DatafileCache,
  ): Promise<[TaggedData, Metrics['cacheStatus']]> {
    const pending = this.fetchDatafile();
    const signal = this.abortController!.signal;
    try {
      await pending;
      signal.throwIfAborted();
    } catch (error) {
      if (signal.aborted) throw error;
      // The controller recorded the failure; the cache decides whether to serve it.
      const stale = cache.read();
      if (!stale) throw error;
      return [stale, 'STALE'];
    }
    return [cache.read()!, 'MISS'];
  }

  private revalidate(): void {
    const pending = this.fetchDatafile();
    const signal = this.abortController?.signal;
    const background = pending.catch((error) => {
      if (!signal?.aborted) {
        console.error('@vercel/flags-core: Header refresh failed:', error);
      }
    });

    try {
      this.options.waitUntil(background);
    } catch {
      // Registration is best-effort; the handled refresh continues regardless.
    }
  }

  private async resolveData(
    cache: DatafileCache,
    current: CacheMetadata,
    updatedAtHeader: number | undefined,
  ): Promise<[TaggedData, Metrics['cacheStatus']] | undefined> {
    if (!current.configUpdatedAt || !updatedAtHeader) return;

    const currentUpdatedAt = Number(current.configUpdatedAt);
    if (updatedAtHeader <= currentUpdatedAt) {
      return [cache.read()!, 'HIT'];
    }

    const freshAt = Math.max(
      current.fetchedAt ?? -Infinity,
      this.lastSeen?.version === currentUpdatedAt
        ? this.lastSeen.at
        : -Infinity,
    );
    const { staleWhileRevalidateMs } = this.options;
    if (
      staleWhileRevalidateMs > 0 &&
      Date.now() - freshAt <= staleWhileRevalidateMs
    ) {
      let stale: TaggedData | undefined;
      try {
        stale = cache.read();
      } catch {
        // Expired stale-if-error requires a blocking recovery attempt below.
      }
      if (stale) {
        this.revalidate();
        return [stale, 'STALE'];
      }
    }

    return this.refresh(cache);
  }

  private observe(version: number, currentVersion: number): boolean {
    this.highestObserved = Math.max(this.highestObserved, version);
    // Once invalidated, an older matching header cannot renew freshness.
    if (version !== currentVersion || version !== this.highestObserved)
      return false;
    this.lastSeen = { version, at: Date.now() };
    return true;
  }

  async read(
    cache: DatafileCache,
  ): Promise<[TaggedData, Metrics['cacheStatus']] | undefined> {
    // Capture the request header before a cold fetch discovers its project.
    const { headers } = getRequestContext();
    const header =
      headers?.['x-vercel-flags-config-versions'] ??
      headers?.['flags-config-versions'];
    const current = cache.metadata;
    const fetched = current ? undefined : await this.refresh(cache);
    const metadata = current ?? cache.metadata!;
    const updatedAtHeader = this.getUpdatedAtHeader(metadata.projectId, header);
    if (
      updatedAtHeader &&
      this.observe(updatedAtHeader, Number(metadata.configUpdatedAt))
    ) {
      cache.tryConfirm(metadata);
    }

    if (fetched) return fetched;
    return this.resolveData(cache, metadata, updatedAtHeader);
  }

  isAvailable(): boolean {
    // Explicit offline mode disables header-driven refreshes too.
    return (
      this.options.vercel &&
      (this.options.stream.enabled || this.options.polling.enabled)
    );
  }

  /**
   * Abort the current header-driven fetch and discard its pending work.
   */
  stop(): void {
    this.abortController?.abort();
    this.abortController = undefined;
    this.promise = undefined;
    this.lastSeen = undefined;
    this.highestObserved = 0;
  }
}
