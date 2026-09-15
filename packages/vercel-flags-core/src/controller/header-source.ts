import { waitUntil } from '@vercel/functions';
import type { BundledDefinitions, DatafileInput, Metrics } from '../types';
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
    if (this.promise) return this.promise;

    const abortController = new AbortController();
    this.abortController = abortController;
    this.promise = fetchDatafile({
      ...this.options,
      signal: abortController.signal,
    })
      .then((data) => {
        this.emit('data', data);
        return data;
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

    const header =
      ctx.headers?.['x-vercel-flags-config-versions'] ??
      ctx.headers?.['flags-config-versions'];

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

  private async resolveData(
    currentData: TaggedData,
  ): Promise<[TaggedData, Metrics['cacheStatus']] | undefined> {
    // current datafile has no timestamp, this shouldn't happen
    if (!currentData.configUpdatedAt) {
      return;
    }

    const updatedAtHeader = this.getUpdatedAtHeader(currentData.projectId);
    if (!updatedAtHeader) {
      return;
    }

    const currentUpdatedAt = Number(currentData.configUpdatedAt);

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
    this.abortController?.abort();
    this.abortController = undefined;
    this.promise = undefined;
  }
}
