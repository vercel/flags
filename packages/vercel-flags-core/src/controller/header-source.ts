import type { Metrics } from '../types';
import { getRequestContext } from '../utils/request-context';
import { fetchDatafile } from './fetch-datafile';
import type { NormalizedOptions } from './normalized-options';
import { type TaggedData, tagData } from './tagged-data';

const MAX_ATTEMPTS = 3;
const REFRESH_TIMEOUT_MS = 10_000;

function version(data: TaggedData | undefined): number {
  const value = Number(data?.configUpdatedAt);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function changeSignal() {
  let notify!: () => void;
  const promise = new Promise<void>((resolve) => {
    notify = resolve;
  });
  return { promise, notify };
}

type Refresh = {
  abort: AbortController;
  promise: Promise<void>;
  changed: ReturnType<typeof changeSignal>;
  background: boolean;
  complete?: boolean;
  stopped?: boolean;
  failed?: { error: unknown };
};

/** One cache owner (the controller), one refresh cycle, independent read requirements. */
export class HeaderSource {
  private highestObserved = 0;
  private lastSeen: { version: number; at: number } | undefined;
  private refresh: Refresh | undefined;

  constructor(
    private options: NormalizedOptions,
    private getData: () => TaggedData | undefined,
    private setData: (data: TaggedData) => void,
  ) {}

  private observe(header: string | undefined): number | undefined {
    const data = this.getData();
    if (!header || !data) return;
    const prefix = `flags_${data.projectId}=`;
    const entry = header
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    const value = Number(entry?.slice(prefix.length));
    if (!Number.isFinite(value) || value <= 0) return;
    this.highestObserved = Math.max(this.highestObserved, value);
    if (value === version(data) && value === this.highestObserved) {
      this.lastSeen = { version: value, at: Date.now() };
    }
    return value;
  }

  private within(data: TaggedData, windowSeconds: number): boolean {
    const freshAt = Math.max(
      data.fetchedAt ?? -Infinity,
      this.lastSeen?.version === version(data) ? this.lastSeen.at : -Infinity,
    );
    return windowSeconds > 0 && Date.now() - freshAt <= windowSeconds * 1000;
  }

  private canServeOnError(data: TaggedData): boolean {
    if (this.options.staleIfError === Infinity) return true;
    return this.within(
      data,
      this.options.staleWhileRevalidate + this.options.staleIfError,
    );
  }

  private keepAlive(refresh: Refresh): void {
    if (refresh.background) return;
    refresh.background = true;
    const handled = refresh.promise.catch((error) => {
      if (!refresh.stopped) {
        console.error('@vercel/flags-core: Header refresh failed:', error);
      }
    });
    try {
      this.options.waitUntil(handled);
    } catch {
      /* best effort */
    }
  }

  private startRefresh(): Refresh {
    if (this.refresh && !this.refresh.complete) return this.refresh;
    const refresh: Refresh = {
      abort: new AbortController(),
      promise: Promise.resolve(),
      changed: changeSignal(),
      background: false,
    };
    this.refresh = refresh;
    refresh.promise = this.runRefresh(refresh)
      .catch((error) => {
        refresh.failed = { error };
        throw error;
      })
      .finally(() => {
        if (this.refresh === refresh) this.refresh = undefined;
      });
    return refresh;
  }

  private async runRefresh(refresh: Refresh): Promise<void> {
    const { signal } = refresh.abort;
    // Bound the whole cycle, including token resolution and response-body parsing.
    let rejectAbort!: (error: unknown) => void;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => rejectAbort(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(
      () =>
        refresh.abort.abort(
          new Error('@vercel/flags-core: Header refresh deadline exceeded'),
        ),
      REFRESH_TIMEOUT_MS,
    );
    let delay: ReturnType<typeof setTimeout> | undefined;
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          await Promise.race([
            new Promise<void>((resolve) => {
              delay = setTimeout(resolve, 100 * 2 ** (attempt - 1));
            }),
            aborted,
          ]);
        }
        signal.throwIfAborted();
        // Immutable target for this attempt; actual version comes from its response.
        const targetVersion = this.highestObserved;
        try {
          const incoming = await Promise.race([
            fetchDatafile({ ...this.options, signal }),
            aborted,
          ]);
          signal.throwIfAborted();
          const current = this.getData();
          if (current && incoming.projectId !== current.projectId) {
            throw new Error('@vercel/flags-core: Datafile project mismatch');
          }
          const received = tagData(incoming, 'fetched');
          const receivedVersion = version(received);
          if (!receivedVersion)
            throw new Error('@vercel/flags-core: Invalid datafile version');
          if (!current || receivedVersion > version(current))
            this.setData(received);

          const satisfied = version(this.getData()) >= this.highestObserved;
          const behind = new Error(
            `@vercel/flags-core: Datafile version ${receivedVersion} is behind required version ${this.highestObserved} (fetch target ${targetVersion})`,
          );
          refresh.complete = satisfied;
          if (!satisfied && attempt === MAX_ATTEMPTS - 1)
            refresh.failed = { error: behind };
          // Wake readers after each response, before waiting for another version.
          const changed = refresh.changed;
          refresh.changed = changeSignal();
          changed.notify();
          if (satisfied) return;
          throw behind;
        } catch (error) {
          if (signal.aborted || attempt === MAX_ATTEMPTS - 1) throw error;
        }
      }
    } finally {
      clearTimeout(timeout);
      clearTimeout(delay);
      signal.removeEventListener('abort', onAbort);
    }
  }

  async read(): Promise<[TaggedData, Metrics['cacheStatus']]> {
    const headers = getRequestContext().headers;
    // Capture request context before any await, including a cold-cache fetch.
    const header = headers?.['x-vercel-flags-config-versions'];
    let required = this.observe(header);
    let fetched = false;
    let previous: Refresh | undefined;
    for (;;) {
      const data = this.getData();
      if (data) {
        // A cold fetch discovers the project needed to parse this read's header.
        if (required === undefined) required = this.observe(header);
        if (required !== undefined && version(data) >= required) {
          if (this.refresh && version(data) < this.highestObserved)
            this.keepAlive(this.refresh);
          return [data, fetched ? 'MISS' : 'HIT'];
        }
        if (required === undefined) {
          return [data, fetched ? 'MISS' : 'STALE'];
        }
        if (previous?.failed) {
          if (!previous.stopped && this.canServeOnError(data))
            return [data, 'STALE'];
          throw previous.failed.error;
        }
        if (this.within(data, this.options.staleWhileRevalidate)) {
          this.keepAlive(this.startRefresh());
          return [data, 'STALE'];
        }
      }
      const refresh = this.startRefresh();
      previous = refresh;
      try {
        await Promise.race([refresh.changed.promise, refresh.promise]);
        fetched = true;
      } catch (error) {
        const cached = this.getData();
        // Shutdown must never fall back to stale data.
        if (cached && !refresh.stopped && this.canServeOnError(cached)) {
          return [cached, 'STALE'];
        }
        throw error;
      }
    }
  }

  stop(): void {
    if (this.refresh) {
      this.refresh.stopped = true;
      this.refresh.abort.abort();
    }
    this.refresh = undefined;
    this.lastSeen = undefined;
    this.highestObserved = 0;
  }
}
