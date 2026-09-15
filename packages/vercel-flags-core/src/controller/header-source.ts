import { waitUntil } from '@vercel/functions';
import type { BundledDefinitions, DatafileInput, Metrics } from '../types';
import { debugLog } from '../utils/debug';
import { getRequestContext } from '../utils/request-context';
import { fetchDatafile } from './fetch-datafile';
import type { NormalizedOptions } from './normalized-options';
import { type TaggedData, tagData } from './tagged-data';
import { TypedEmitter } from './typed-emitter';

export type HeaderSourceEvents = {
  data: (data: DatafileInput) => void;
};

/**
 * Manages a lazy pulling of flag data from the flags service using the version header.
 */
export class HeaderSource extends TypedEmitter<HeaderSourceEvents> {
  private options: NormalizedOptions;
  private abortController: AbortController | undefined;
  private promise: Promise<BundledDefinitions> | undefined;

  constructor(options: NormalizedOptions) {
    super();

    this.options = options;
  }

  private fetchDatafile(): Promise<BundledDefinitions> {
    // Share only the transport work, not request-specific freshness decisions.
    if (this.promise) {
      debugLog('header-source', 'Reusing pending refresh');
      return this.promise;
    }

    debugLog('header-source', 'Starting refresh');
    const abortController = new AbortController();
    this.abortController = abortController;
    this.promise = fetchDatafile({
      ...this.options,
      signal: abortController.signal,
    })
      .then((data) => {
        // A transport may finish after stop() even if it ignores cancellation.
        abortController.signal.throwIfAborted();
        debugLog('header-source', 'Refresh completed', {
          projectId: data.projectId,
          configUpdatedAt: Number(data.configUpdatedAt),
          revision: data.revision,
        });
        this.emit('data', data);
        return data;
      })
      .catch((error) => {
        debugLog('header-source', 'Refresh failed', {
          aborted: abortController.signal.aborted,
        });
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

  private getUpdatedAtHeader(projectId: string) {
    const ctx = getRequestContext();

    const headerName =
      ctx.headers?.['x-vercel-edge-config-versions'] != null
        ? 'x-vercel-edge-config-versions'
        : 'edge-config-versions';
    const header = ctx.headers?.[headerName];
    // const header =
    //   ctx.headers?.['x-vercel-flags-config-versions'] ??
    //   ctx.headers?.['flags-config-versions'];

    if (!header) {
      debugLog('header-source', 'Header unavailable', {
        projectId,
        reason: 'missing-header',
      });
      return;
    }

    const prefix = `flags_${projectId}=`;
    const value = header
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);
    const timestamp = Number(value);

    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      debugLog('header-source', 'Header unavailable', {
        projectId,
        headerName,
        reason: value === undefined ? 'project-not-found' : 'invalid-timestamp',
      });
      return;
    }

    debugLog('header-source', 'Header version available', {
      projectId,
      headerName,
      timestamp,
    });
    return timestamp;
  }

  private async resolveData(
    currentData: TaggedData,
  ): Promise<[TaggedData, Metrics['cacheStatus']] | undefined> {
    // current datafile has no timestamp, this shouldn't happen
    if (!currentData.configUpdatedAt) {
      debugLog('header-source', 'Skipping header refresh', {
        projectId: currentData.projectId,
        reason: 'missing-data-timestamp',
      });
      return;
    }

    const updatedAtHeader = this.getUpdatedAtHeader(currentData.projectId);
    if (!updatedAtHeader) {
      return;
    }

    const currentUpdatedAt = Number(currentData.configUpdatedAt);
    const deltaMs = updatedAtHeader - currentUpdatedAt;
    debugLog('header-source', 'Freshness decision', {
      projectId: currentData.projectId,
      currentUpdatedAt,
      headerUpdatedAt: updatedAtHeader,
      deltaMs,
      action:
        updatedAtHeader <= currentUpdatedAt
          ? 'serve-cached'
          : updatedAtHeader <= currentUpdatedAt + 10_000
            ? 'background-refresh'
            : 'blocking-refresh',
    });

    // header is older than current data
    if (updatedAtHeader <= currentUpdatedAt) {
      return [currentData, 'HIT'];
    }

    // header is within 10 seconds of current data, we can revalidate in the background
    if (updatedAtHeader <= currentUpdatedAt + 10_000) {
      const pending = this.fetchDatafile();
      const signal = this.abortController?.signal;
      const background = pending.catch((error) => {
        if (!signal?.aborted) {
          console.error('@vercel/flags-core: Header refresh failed:', error);
        }
      });

      waitUntil(background);

      return [currentData, 'STALE'];
    }

    const data = await this.fetchDatafile();

    return [tagData(data, 'fetched'), 'MISS'];
  }

  read(
    currentData: TaggedData,
  ): Promise<[TaggedData, Metrics['cacheStatus']] | undefined> {
    return this.resolveData(currentData);
  }

  isAvailable(projectId: string): boolean {
    return !!this.getUpdatedAtHeader(projectId);
  }

  /**
   * Abort the current header-driven fetch and discard its pending work.
   */
  stop(): void {
    debugLog('header-source', 'Stopping header refresh', {
      pending: this.promise !== undefined,
    });
    this.abortController?.abort();
    this.abortController = undefined;
    this.promise = undefined;
  }
}
