import { waitUntil } from '@vercel/functions';
import type { DatafileInput, Metrics } from '../types';
import { fetchDatafile } from './fetch-datafile';
import type { NormalizedOptions } from './normalized-options';
import { parseLocalTimestamp } from './routed-init';
import type { TaggedData } from './tagged-data';

// Like Global Config on Node, this is a version timestamp gap, not a TTL.
const BLOCKING_VERSION_GAP_MS = 10_000;
const RETRY_DELAY_MS = 1000;

type Refresh = {
  version: number;
  promise: Promise<void>;
  finish: () => void;
  controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  started: boolean;
};

export type PushVersionRead = [
  TaggedData,
  Metrics['cacheStatus'],
  {
    mode: 'pushVersion';
    cacheStatus: 'HIT' | 'MISS' | 'STALE';
    cacheAction: 'NONE' | 'REFRESHING' | 'FOLLOWING';
    cacheIsBlocking: boolean;
  },
];

/** Request-driven refreshes only: no subscription or periodic polling. */
export class PushVersionSource {
  private refresh: Refresh | undefined;
  private failedVersion = -1;
  private retryAt = 0;
  private generation = 0;

  constructor(
    private readonly options: NormalizedOptions,
    private readonly getData: () => TaggedData | undefined,
    private readonly onData: (data: DatafileInput) => void,
  ) {}

  async read(version: number): Promise<PushVersionRead> {
    const data = this.getData();
    const local = parseLocalTimestamp(data?.configUpdatedAt);
    if (data && local !== undefined && local >= version) {
      return this.result(data, 'HIT', 'NONE', false);
    }

    if (
      data &&
      !this.refresh &&
      version <= this.failedVersion &&
      Date.now() < this.retryAt
    ) {
      return this.result(data, 'STALE', 'NONE', false);
    }

    const blocking =
      local === undefined || version - local >= BLOCKING_VERSION_GAP_MS;
    const following = !!this.refresh;
    const refresh = this.revalidate(version, !blocking);

    if (blocking) {
      await refresh;
    } else {
      // Register while still in this request, including when following an
      // older in-flight refresh that will need another fetch afterward.
      try {
        waitUntil(refresh);
      } catch {
        /* best effort off Vercel */
      }
    }

    const result = blocking ? this.getData() : data;
    if (!result)
      throw new Error('@vercel/flags-core: No flag definitions available.');
    const updatedAt = parseLocalTimestamp(result.configUpdatedAt);
    const status =
      updatedAt !== undefined && updatedAt >= version ? 'MISS' : 'STALE';
    return this.result(
      result,
      status,
      following ? 'FOLLOWING' : 'REFRESHING',
      blocking,
    );
  }

  private result(
    data: TaggedData,
    status: Metrics['cacheStatus'],
    action: 'NONE' | 'REFRESHING' | 'FOLLOWING',
    blocking: boolean,
  ): PushVersionRead {
    return [
      data,
      status,
      {
        mode: 'pushVersion',
        cacheStatus: status,
        cacheAction: action,
        cacheIsBlocking: blocking,
      },
    ];
  }

  private revalidate(version: number, background: boolean): Promise<void> {
    if (this.refresh) {
      const refresh = this.refresh;
      // Before the scheduled fetch starts, coalesce requests to the largest
      // minimum version. A blocking reader can start it without waiting a tick.
      if (!refresh.started) {
        refresh.version = Math.max(refresh.version, version);
        if (!background) this.start(refresh);
      } else if (version > refresh.version) {
        const generation = this.generation;
        return refresh.promise.then(() => {
          if (generation === this.generation)
            return this.revalidate(version, background);
        });
      }
      return refresh.promise;
    }
    const local = parseLocalTimestamp(this.getData()?.configUpdatedAt);
    if (local !== undefined && local >= version) return Promise.resolve();
    if (version <= this.failedVersion && Date.now() < this.retryAt)
      return Promise.resolve();

    let finish!: () => void;
    const refresh: Refresh = {
      version,
      promise: new Promise<void>((resolve) => {
        finish = resolve;
      }),
      finish: () => finish(),
      controller: new AbortController(),
      started: false,
    };
    this.refresh = refresh;

    if (background) {
      // Even invoking fetch can take milliseconds. Keep it off the read path.
      refresh.timer = setTimeout(() => this.start(refresh), 0);
    } else {
      this.start(refresh);
    }
    return refresh.promise;
  }

  private start(refresh: Refresh): void {
    if (refresh.started || this.refresh !== refresh) return;
    refresh.started = true;
    clearTimeout(refresh.timer);
    void this.fetch(refresh);
  }

  private async fetch(refresh: Refresh): Promise<void> {
    try {
      const data = await fetchDatafile({
        ...this.options,
        minUpdatedAt: refresh.version,
        signal: refresh.controller.signal,
      });
      if (refresh.controller.signal.aborted) return;
      const current = this.getData();
      const updatedAt = parseLocalTimestamp(data.configUpdatedAt);
      const local = parseLocalTimestamp(current?.configUpdatedAt);
      // Do not replace newer definitions, or cache an unverifiable response.
      if (
        updatedAt !== undefined &&
        (!current || data.projectId === current.projectId)
      ) {
        if (local === undefined || updatedAt > local) {
          this.onData(data);
        }
      }
    } catch {
      // Keep last-known definitions on network/auth/parse failures.
    } finally {
      if (this.refresh === refresh) {
        const local = parseLocalTimestamp(this.getData()?.configUpdatedAt);
        if (local === undefined || local < refresh.version) {
          this.failedVersion = refresh.version;
          this.retryAt = Date.now() + RETRY_DELAY_MS;
        }
        this.refresh = undefined;
      }
      refresh.finish();
    }
  }

  stop(): void {
    this.generation++;
    const refresh = this.refresh;
    this.refresh = undefined;
    if (refresh) {
      clearTimeout(refresh.timer);
      refresh.controller.abort();
      refresh.finish();
    }
    this.failedVersion = -1;
    this.retryAt = 0;
  }
}
