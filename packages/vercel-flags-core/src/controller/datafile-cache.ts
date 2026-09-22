import type { DatafileInput } from '../types';
import { parseConfigUpdatedAt } from './datafile-version';
import type { TaggedData } from './tagged-data';

/** Storage and failure-relative read policy; callers provide source evidence. */
export class DatafileCache {
  private data: TaggedData | undefined;
  private failure: { error: Error; startedAt: number } | undefined;

  peek(): TaggedData | undefined {
    return this.data;
  }

  set(data: TaggedData): TaggedData {
    this.data = data;
    return data;
  }

  /** Reports a source update synchronously accepted and stored by the caller. */
  confirm(): void {
    if (this.data) {
      this.failure = undefined;
    }
  }

  /** Confirms a same-version source response without replacing stored data. */
  tryConfirm(incoming: DatafileInput): boolean {
    if (!this.data) return false;

    const currentTs = parseConfigUpdatedAt(this.data.configUpdatedAt);
    const incomingTs = parseConfigUpdatedAt(incoming.configUpdatedAt);
    if (
      !Number.isFinite(currentTs) ||
      !Number.isFinite(incomingTs) ||
      currentTs !== incomingTs ||
      this.data.projectId !== incoming.projectId ||
      this.data.environment !== incoming.environment
    ) {
      return false;
    }

    this.confirm();
    return true;
  }

  fail(error: Error): void {
    this.failure ??= { error, startedAt: Date.now() };
  }

  read(staleIfErrorMs: number): TaggedData | undefined {
    if (!this.data) return undefined;

    if (!this.failure || staleIfErrorMs === Infinity) return this.data;

    const withinAllowance =
      staleIfErrorMs > 0 &&
      Date.now() - this.failure.startedAt <= staleIfErrorMs;
    if (!withinAllowance) {
      throw this.failure.error;
    }
    return this.data;
  }

  clear(): void {
    this.data = undefined;
  }
}
