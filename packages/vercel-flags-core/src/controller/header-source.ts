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
  private promise:
    | Promise<[TaggedData, Metrics['cacheStatus']] | undefined>
    | undefined;

  constructor(options: NormalizedOptions) {
    super();

    this.options = options;
  }

  private fetchDatafile(): Promise<BundledDefinitions> {
    const abortController = new AbortController();
    this.abortController = abortController;

    abortController.signal.addEventListener(
      'abort',
      () => {
        if (this.abortController === abortController) {
          this.promise = undefined;
          this.abortController = undefined;
        }
      },
      { once: true },
    );

    try {
      return fetchDatafile(this.options);
    } catch (error) {
      this.promise = undefined;
      this.abortController = undefined;
      throw error;
    }
  }

  private getUpdatedAtHeader(projectId: string) {
    const ctx = getRequestContext();

    const header =
      ctx.headers?.['x-vercel-flags-config-versions'] ??
      ctx.headers?.['x-vercel-flags-config-versions'];

    if (!header) {
      return;
    }

    const value = header
      .split(';')
      .find((p) => p.startsWith(`flags_${projectId}=`))
      ?.split('=')[1];

    return Number(value);
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
      this.fetchDatafile().then((data) => {
        this.emit('data', data);
      });

      return [currentData, 'STALE'];
    }

    const data = await this.fetchDatafile();
    this.emit('data', data);

    return [tagData(data, 'fetched'), 'MISS'];
  }

  read(
    currentData: TaggedData,
  ): Promise<[TaggedData, Metrics['cacheStatus']] | undefined> {
    if (this.promise) return this.promise;

    this.promise = this.resolveData(currentData);

    return this.promise;
  }

  isAvailable(projectId: string): boolean {
    return !!this.getUpdatedAtHeader(projectId);
  }

  /**
   * Stop the stream connection.
   */
  stop(): void {
    this.abortController?.abort();
    this.abortController = undefined;
    this.promise = undefined;
  }
}
