import type { IncomingHttpHeaders } from 'node:http';
import { setSpanAttribute, trace } from '../lib/tracing';
import type { ReadonlyHeaders } from '../spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';
import type { Adapter } from '../types';
import {
  applyResult,
  getCachedValuePromise,
  getEntities,
  hasOverride,
} from './evaluation';

// Internal markers stamped on the flag api by each framework's `flag()`. Read
// by `evaluateFlags` to partition flags into adapter groups.
//
// - BULK_IDENTIFY_REF: the raw identify source for reference-equality
//   comparison across flags. The wrapped `api.identify` is created per
//   `flag()` call, so it can't be used for grouping.
// - BULKABLE: whether the flag can participate in adapter-level bulk
//   evaluation. An inline `definition.decide` disqualifies the flag
//   because `getDecide` prefers it over the adapter's decide.
export const BULK_IDENTIFY_REF = Symbol('flags.bulkIdentifyRef');
export const BULKABLE = Symbol('flags.bulkable');

/** The minimal flag-function shape `evaluateFlags` reads. */
export type EvaluableFlag = {
  (...args: any[]): Promise<any>;
  key: string;
  defaultValue?: any;
  adapter?: Adapter<any, any>;
};

/**
 * Framework-agnostic core of `evaluate()`. Given pre-read request context,
 * partitions flags by `(adapterId, identify)` so adapters that implement
 * `bulkDecide` resolve an entire group in a single call, and runs the rest
 * through the per-flag path. Returns positional results for an array input and
 * keyed results for an object input.
 *
 * Context acquisition (e.g. `next/headers` vs a `Request`) and how standalone
 * flags are invoked are supplied by the caller:
 * - `invokeStandalone` runs a flag that isn't bulk-eligible (Next calls
 *   `flagFn()`; SvelteKit calls `flagFn(request)`).
 * - `isFrameworkError` opts framework control-flow errors out of the
 *   per-flag defaultValue fallback.
 */
export async function evaluateFlags({
  flags,
  readonlyHeaders,
  readonlyCookies,
  dedupeCacheKey,
  overrides,
  invokeStandalone,
  isFrameworkError,
}: {
  flags: Record<string, EvaluableFlag> | readonly EvaluableFlag[];
  readonlyHeaders: ReadonlyHeaders;
  readonlyCookies: ReadonlyRequestCookies;
  dedupeCacheKey: Headers | IncomingHttpHeaders;
  overrides: Record<string, any> | null;
  invokeStandalone: (flagFn: EvaluableFlag) => Promise<any>;
  isFrameworkError?: (error: unknown) => boolean;
}): Promise<any> {
  const entries = Object.entries(flags);

  const standalone: { name: string; flagFn: EvaluableFlag }[] = [];
  // adapterId -> identifyRef -> { adapter, entries }
  const groups = new Map<
    string | symbol,
    Map<
      unknown,
      {
        adapter: Adapter<any, any>;
        entries: { name: string; flagFn: EvaluableFlag }[];
      }
    >
  >();

  for (const [name, flagFn] of entries) {
    const entry = { name, flagFn };
    if (!(flagFn as any)[BULKABLE]) {
      standalone.push(entry);
      continue;
    }
    const adapter = flagFn.adapter as Adapter<any, any>;
    const groupId = adapter.adapterId as string | symbol;
    const identifyRef = (flagFn as any)[BULK_IDENTIFY_REF] ?? null;
    let byIdentify = groups.get(groupId);
    if (!byIdentify) {
      byIdentify = new Map();
      groups.set(groupId, byIdentify);
    }
    let bucket = byIdentify.get(identifyRef);
    if (!bucket) {
      // Capture the first adapter for this group — any adapter with the
      // same adapterId must wrap the same underlying resource.
      bucket = { adapter, entries: [] };
      byIdentify.set(identifyRef, bucket);
    }
    bucket.entries.push(entry);
  }

  const valuesByName: Record<string, any> = {};
  const groupPromises: Promise<unknown>[] = [];

  for (const byIdentify of groups.values()) {
    for (const [identifyRef, { adapter, entries: list }] of byIdentify) {
      groupPromises.push(
        // One `batch` span per bulk-evaluated group (a batch being a single
        // group within the overall `evaluate()` bulk), replacing the
        // per-flag `run` span that bulkable flags would otherwise get via
        // `flagFn()`. A per-flag span here would reintroduce the per-flag
        // instrumentation overhead (closure + span + microtask) that bulk
        // evaluation exists to avoid, so the batch reports an aggregate
        // `method`/count summary instead. Standalone flags still emit their
        // own `flag` span.
        trace(
          async () => {
            // Resolve entities once for the entire group. The dedupe key is
            // the same one the per-flag path uses, so any flag called
            // individually before/after `evaluate()` reuses the cached
            // identify args.
            const entities = identifyRef
              ? await getEntities(
                  identifyRef as any,
                  dedupeCacheKey,
                  readonlyHeaders,
                  readonlyCookies,
                )
              : undefined;
            const entitiesKey = JSON.stringify(entities) ?? '';

            // Skip flags already resolved this request — `applyResult` would
            // discard the bulk result for them anyway.
            const uncached = list.filter(
              ({ flagFn }) =>
                getCachedValuePromise(
                  readonlyHeaders,
                  flagFn.key,
                  entitiesKey,
                ) === undefined,
            );
            const undecided = uncached.filter(
              ({ flagFn }) => !hasOverride(overrides, flagFn.key),
            );

            // Call bulkDecide only for flags that are neither cached nor
            // overridden. If it throws, every undecided flag still goes
            // through `applyResult` — its producer just rethrows, so the
            // catch arm handles the per-flag defaultValue fallback (or
            // rejects for flags without a defaultValue).
            let bulkResult: Record<string, any> | null = null;
            let bulkError: unknown = null;
            if (undecided.length > 0) {
              try {
                bulkResult = await adapter.bulkDecide!({
                  flags: undecided.map(({ flagFn }) => ({
                    key: flagFn.key,
                    defaultValue: flagFn.defaultValue,
                  })),
                  entities,
                  headers: readonlyHeaders,
                  cookies: readonlyCookies,
                });
              } catch (err) {
                bulkError = err;
              }
            }

            await Promise.all(
              list.map(async ({ name, flagFn }) => {
                valuesByName[name] = await applyResult({
                  definition: flagFn,
                  readonlyHeaders,
                  entitiesKey,
                  overrides,
                  isFrameworkError,
                  produce: () => {
                    if (bulkError) throw bulkError;
                    return bulkResult![flagFn.key];
                  },
                });
              }),
            );

            // `applyResult` stamps a per-flag `method` onto the active span;
            // here that span is shared by the whole group, so overwrite it
            // with `bulk`. `trace` flushes the span-context store last, so
            // this final write wins over the per-flag ones. The per-flag
            // breakdown is reported as counts via `attributesSuccess`.
            setSpanAttribute('method', 'bulk');

            // Returned so the span can derive aggregate counts lazily —
            // `attributesSuccess` only runs when a tracer is registered, so
            // nothing here costs anything on the untraced hot path.
            return { uncached, undecided };
          },
          {
            name: 'batch',
            isVerboseTrace: false,
            attributes: { adapterId: String(adapter.adapterId) },
            attributesSuccess: ({ uncached, undecided }) => {
              const cachedCount = list.length - uncached.length;
              const overrideCount = uncached.length - undecided.length;
              return {
                keys: list.map(({ flagFn }) => flagFn.key),
                cachedCount,
                overrideCount,
                decidedCount: undecided.length,
              };
            },
          },
        )(),
      );
    }
  }

  if (standalone.length > 0) {
    groupPromises.push(
      (async () => {
        const values = await Promise.all(
          standalone.map(({ flagFn }) => invokeStandalone(flagFn)),
        );
        standalone.forEach(({ name }, i) => {
          valuesByName[name] = values[i];
        });
      })(),
    );
  }

  await Promise.all(groupPromises);

  const result: any = Array.isArray(flags) ? new Array(entries.length) : {};
  for (const [name] of entries) {
    result[name] = valuesByName[name];
  }
  return result;
}
