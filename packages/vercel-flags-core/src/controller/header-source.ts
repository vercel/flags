import { getRequestContext } from '../utils/request-context';
import type { CacheReadPolicy } from './datafile-cache';
import { debug } from './debug';
import type { NormalizedOptions } from './normalized-options';

/** Request version evidence; the cache decides how to serve reads. */
export class HeaderSource {
  private highestObserved = 0;

  constructor(private readonly options: NormalizedOptions) {}

  private getVersionHeader(): string | undefined {
    const { headers } = getRequestContext();
    return (
      headers?.['x-vercel-flags-config-versions'] ??
      headers?.['flags-config-versions']
    );
  }

  /** Capture the header now so a shared fetch cannot switch the request being assessed. */
  getAssessment(): CacheReadPolicy['assess'] {
    const header = this.getVersionHeader();

    return (data) => {
      const headerTs = this.getUpdatedAtHeader(data.projectId, header);
      debug(this.options.clientName, 'header.observed', () => ({
        projectId: data.projectId,
        hasHeader: Boolean(header),
        headerTimestamp: headerTs,
        configUpdatedAt: Number(data.configUpdatedAt),
        previousHighestObserved: this.highestObserved,
        staleWhileRevalidateMs: this.options.staleWhileRevalidateMs,
      }));
      if (headerTs === undefined) {
        return { status: 'error' };
      }

      const currentTs = Number(data.configUpdatedAt);
      this.highestObserved = Math.max(this.highestObserved, headerTs);

      if (!Number.isFinite(currentTs) || currentTs <= 0) {
        return { status: 'error' };
      }

      if (headerTs <= currentTs) {
        // Older requests are satisfied without undoing a newer request's invalidation.
        return {
          status: 'fresh',
          confirmed:
            headerTs === currentTs && headerTs === this.highestObserved,
        };
      }

      const { staleWhileRevalidateMs } = this.options;
      return {
        status:
          staleWhileRevalidateMs > 0 && data.ageMs <= staleWhileRevalidateMs
            ? 'stale'
            : 'expired',
      };
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

  isEnabled(): boolean {
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
