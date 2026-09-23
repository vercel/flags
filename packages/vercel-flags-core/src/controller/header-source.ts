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

  constructor(private readonly options: NormalizedOptions) {
    super();
  }

  private getVersionHeader(): string | undefined {
    const { headers } = getRequestContext();
    return (
      headers?.['x-vercel-flags-config-versions'] ??
      headers?.['flags-config-versions']
    );
  }

  hasVersionHeader(): boolean {
    return Boolean(this.getVersionHeader());
  }

  /** Capture the header now so a shared fetch cannot switch the request being assessed. */
  getStatusCheck(): CacheReadPolicy['getStatus'] {
    const header = this.getVersionHeader();

    return (data) => {
      const headerTs = this.getUpdatedAtHeader(data.projectId, header);
      if (headerTs === undefined) return 'unknown';

      const currentTs = Number(data.configUpdatedAt);
      this.highestObserved = Math.max(this.highestObserved, headerTs);

      if (!Number.isFinite(currentTs) || currentTs <= 0) return 'unknown';

      // An older matching request cannot undo a newer request's invalidation.
      if (headerTs === currentTs && headerTs === this.highestObserved) {
        this.emit('confirmed', data);
      }

      // This request is satisfied; only confirmation above can renew age or clear failure.
      if (headerTs <= currentTs) return 'fresh';

      const { staleWhileRevalidateMs } = this.options;
      return staleWhileRevalidateMs > 0 && data.ageMs <= staleWhileRevalidateMs
        ? 'stale'
        : 'expired';
    };
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

  fetch = async (signal: AbortSignal): Promise<void> => {
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
    this.highestObserved = 0;
  }
}
