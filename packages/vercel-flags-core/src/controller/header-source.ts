import type { BundledDefinitions, DatafileInput } from '../types';
import { getRequestContext } from '../utils/request-context';
import { fetchDatafile } from './fetch-datafile';
import type { NormalizedOptions } from './normalized-options';
import type { TaggedData } from './tagged-data';
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
  private highestObserved = 0;
  private lastSeen: { version: number; at: number } | undefined;

  constructor(options: NormalizedOptions) {
    super();

    this.options = options;
  }

  refresh(): Promise<BundledDefinitions> {
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

  /** Capture request context before asynchronous work, including a cold fetch. */
  request(): (data: TaggedData | undefined) => number | undefined {
    const { headers } = getRequestContext();
    const header =
      headers?.['x-vercel-flags-config-versions'] ??
      headers?.['flags-config-versions'];
    return (data) => {
      if (!data) return undefined;
      const version = this.getUpdatedAtHeader(data.projectId, header);
      if (version) this.observe(version, Number(data.configUpdatedAt));
      return version;
    };
  }

  matches(data: TaggedData, required: number | undefined): boolean {
    return (
      required !== undefined &&
      required === Number(data.configUpdatedAt) &&
      required === this.highestObserved
    );
  }

  confirmedAt(data: TaggedData): number {
    return this.lastSeen?.version === Number(data.configUpdatedAt)
      ? this.lastSeen.at
      : -Infinity;
  }

  private observe(version: number, currentVersion: number): void {
    this.highestObserved = Math.max(this.highestObserved, version);
    // Once invalidated, an older matching header cannot renew freshness.
    if (version !== currentVersion || version !== this.highestObserved) return;
    this.lastSeen = { version, at: Date.now() };
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
