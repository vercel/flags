import type { IngestEvent } from './usage/events';

export type RuntimeIngest = (payload: {
  headers: Record<string, string>;
  body: IngestEvent[];
}) => boolean;

const FLAGS_CONTEXT_SYMBOL = Symbol.for('@vercel/flags-context');

/**
 * Returns the ingest transport provided by the runtime, if available.
 */
export function getRuntimeIngest(): RuntimeIngest | undefined {
  try {
    const context = (
      globalThis as typeof globalThis & {
        [key: symbol]: { ingest?: unknown } | undefined;
      }
    )[FLAGS_CONTEXT_SYMBOL];

    return typeof context?.ingest === 'function'
      ? (context.ingest as RuntimeIngest)
      : undefined;
  } catch {
    return undefined;
  }
}
