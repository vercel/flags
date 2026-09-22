import type { DatafileInput } from '../types';
import { type DataOrigin, type TaggedData, tagData } from './tagged-data';

/**
 * Parses a configUpdatedAt value (number or string) into a numeric timestamp.
 * Returns undefined if the value is missing or cannot be parsed.
 */
function parseConfigUpdatedAt(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

/** Storage and failure-relative read policy; callers provide source evidence. */
export class DatafileCache {
  private data: TaggedData | undefined;
  private failure: { error: Error; startedAt: number } | undefined;

  peek(): TaggedData | undefined {
    return this.data;
  }

  /** Stores initial or fallback data without confirming recovery from a failure. */
  seed(data: TaggedData): TaggedData {
    this.data = data;
    return data;
  }

  /** Accepts a source update or confirms the current version without replacing it. */
  updateFromSource(incoming: DatafileInput, origin: DataOrigin): void {
    if (this.isNewerData(incoming)) {
      this.data = tagData(incoming, origin);
      this.failure = undefined;
      return;
    }
    this.tryConfirm(incoming);
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

    this.failure = undefined;
    return true;
  }

  /** Preserves existing acceptance, including missing or unparseable versions. */
  private isNewerData(incoming: DatafileInput): boolean {
    if (!this.data) return true;

    const currentTs = parseConfigUpdatedAt(this.data.configUpdatedAt);
    const incomingTs = parseConfigUpdatedAt(incoming.configUpdatedAt);

    if (currentTs === undefined || incomingTs === undefined) {
      return true;
    }

    return incomingTs > currentTs;
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
