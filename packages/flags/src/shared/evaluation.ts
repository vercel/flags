import type { IncomingHttpHeaders } from 'node:http';
import { internalReportValue, reportValue } from '../lib/report-value';
import { setSpanAttribute } from '../lib/tracing';
import type { ReadonlyHeaders } from '../spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';
import type { FlagDeclaration, FlagParamsType, JsonValue } from '../types';

/**
 * Per-request evaluation cache, keyed by the request's headers identity so the
 * same flag (and entities) only decides once per request. Supports `Headers`
 * (App Router / SvelteKit / Web requests) and `IncomingHttpHeaders` (Pages
 * Router `IncomingMessage`) as the outer key.
 *
 * Shape: `(headers) -> (flagKey) -> (entitiesKey) -> valuePromise`.
 */
const evaluationCache = new WeakMap<
  Headers | IncomingHttpHeaders,
  Map</* flagKey */ string, Map</* entitiesKey */ string, any>>
>();

export function getCachedValuePromise(
  headers: Headers | IncomingHttpHeaders,
  flagKey: string,
  entitiesKey: string,
): any {
  return evaluationCache.get(headers)?.get(flagKey)?.get(entitiesKey);
}

export function setCachedValuePromise(
  headers: Headers | IncomingHttpHeaders,
  flagKey: string,
  entitiesKey: string,
  flagValue: any,
): void {
  const byHeaders = evaluationCache.get(headers);

  if (!byHeaders) {
    evaluationCache.set(
      headers,
      new Map([[flagKey, new Map([[entitiesKey, flagValue]])]]),
    );
    return;
  }

  const byFlagKey = byHeaders.get(flagKey);
  if (!byFlagKey) {
    byHeaders.set(flagKey, new Map([[entitiesKey, flagValue]]));
    return;
  }

  byFlagKey.set(entitiesKey, flagValue);
}

/**
 * Returns the flags evaluated so far for a given request, as a record of flag
 * key to value promise. When a flag was evaluated for multiple entity sets in
 * the same request, the most recently evaluated value wins.
 *
 * Used to report which flags a request used (e.g. SvelteKit injects these into
 * the rendered HTML for the Vercel Toolbar).
 */
export function getUsedFlags(
  headers: Headers | IncomingHttpHeaders,
): Record<string, Promise<JsonValue>> {
  const byFlagKey = evaluationCache.get(headers);
  const result: Record<string, Promise<JsonValue>> = {};
  if (!byFlagKey) return result;

  for (const [flagKey, byEntitiesKey] of byFlagKey) {
    let last: Promise<JsonValue> | undefined;
    for (const valuePromise of byEntitiesKey.values()) last = valuePromise;
    if (last !== undefined) result[flagKey] = last;
  }

  return result;
}

type IdentifyArgs = Parameters<
  Exclude<FlagDeclaration<any, any>['identify'], undefined>
>;
const identifyArgsMap = new WeakMap<
  Headers | IncomingHttpHeaders,
  IdentifyArgs
>();

function isIdentifyFunction<ValueType, EntitiesType>(
  identify: FlagDeclaration<ValueType, EntitiesType>['identify'] | EntitiesType,
): identify is FlagDeclaration<ValueType, EntitiesType>['identify'] {
  return typeof identify === 'function';
}

/**
 * Resolves the entities for a flag evaluation. When `identify` is a function it
 * is called with a stable args object (cached per `dedupeCacheKey`) so that a
 * user-supplied `dedupe()` wrapper deduplicates across flags sharing the same
 * request. When `identify` is already an entities value it is returned as-is.
 */
export async function getEntities<ValueType, EntitiesType>(
  identify: FlagDeclaration<ValueType, EntitiesType>['identify'] | EntitiesType,
  dedupeCacheKey: Headers | IncomingHttpHeaders,
  readonlyHeaders: ReadonlyHeaders,
  readonlyCookies: ReadonlyRequestCookies,
): Promise<EntitiesType | undefined> {
  if (!identify) return undefined;
  if (!isIdentifyFunction(identify)) return identify;

  const args = identifyArgsMap.get(dedupeCacheKey);
  if (args) return identify(...(args as [FlagParamsType]));

  const nextArgs: IdentifyArgs = [
    { headers: readonlyHeaders, cookies: readonlyCookies },
  ];
  identifyArgsMap.set(dedupeCacheKey, nextArgs);
  return identify(...(nextArgs as [FlagParamsType]));
}

/**
 * Subset of a flag declaration / flag function that `applyResult` reads.
 * Both a `FlagDeclaration` and the flag `api` (after `flag()` stamps `config`
 * onto it) satisfy this shape.
 */
export type FlagInfo<ValueType> = {
  key: string;
  defaultValue?: ValueType;
  config?: { reportValue?: boolean };
  adapter?: { config?: { reportValue?: boolean } };
};

export function hasOverride(
  overrides: Record<string, any> | null,
  key: string,
): overrides is Record<string, any> {
  return overrides !== null && overrides[key] !== undefined;
}

function shouldReportValue(definition: FlagInfo<any>): boolean {
  return (
    (definition.config?.reportValue ??
      definition.adapter?.config?.reportValue) !== false
  );
}

/**
 * Finalize a flag evaluation given an already-computed `entitiesKey`.
 *
 * Handles, in order: cache hit → override → produce → defaultValue/error
 * normalization → cache write → reportValue. Override and cache writes write to
 * the same `evaluationCache` every caller uses, so a subsequent evaluation of
 * the same flag in the same request hits cache regardless of which path
 * populated it.
 *
 * `isFrameworkError` lets a framework opt certain errors out of the
 * defaultValue fallback so they propagate (e.g. Next's `redirect()` /
 * `notFound()` control-flow errors). Defaults to never matching.
 */
export async function applyResult<ValueType>(args: {
  definition: FlagInfo<ValueType>;
  readonlyHeaders: ReadonlyHeaders;
  entitiesKey: string;
  overrides: Record<string, any> | null;
  produce: () => ValueType | PromiseLike<ValueType>;
  isFrameworkError?: (error: unknown) => boolean;
}): Promise<ValueType> {
  const {
    definition,
    readonlyHeaders,
    entitiesKey,
    overrides,
    produce,
    isFrameworkError = () => false,
  } = args;

  const cachedValue = getCachedValuePromise(
    readonlyHeaders,
    definition.key,
    entitiesKey,
  );
  if (cachedValue !== undefined) {
    setSpanAttribute('method', 'cached');
    return await cachedValue;
  }

  if (hasOverride(overrides, definition.key)) {
    setSpanAttribute('method', 'override');
    const decision = overrides[definition.key] as ValueType;
    setCachedValuePromise(
      readonlyHeaders,
      definition.key,
      entitiesKey,
      Promise.resolve(decision),
    );
    internalReportValue(definition.key, decision, {
      reason: 'override',
    });
    return decision;
  }

  // Normalize the result of produce() into a promise. produce() may return
  // synchronously or asynchronously, and may also throw synchronously.
  // Fall back to defaultValue when produce returns undefined or throws.
  let decisionResult: ValueType | PromiseLike<ValueType>;
  try {
    decisionResult = produce();
  } catch (error) {
    decisionResult = Promise.reject(error);
  }

  const decisionPromise = Promise.resolve(decisionResult).then<
    ValueType,
    ValueType
  >(
    (value) => {
      if (value !== undefined) return value;
      if (definition.defaultValue !== undefined) return definition.defaultValue;
      throw new Error(
        `flags: Flag "${definition.key}" must have a defaultValue or a decide function that returns a value`,
      );
    },
    (error: Error) => {
      if (isFrameworkError(error)) throw error;

      // try to recover if defaultValue is set
      if (definition.defaultValue !== undefined) {
        if (process.env.NODE_ENV === 'development') {
          console.info(
            `flags: Flag "${definition.key}" is falling back to its defaultValue`,
          );
        } else {
          console.warn(
            `flags: Flag "${definition.key}" is falling back to its defaultValue after catching the following error`,
            error,
          );
        }
        return definition.defaultValue;
      }
      console.warn(`flags: Flag "${definition.key}" could not be evaluated`);
      throw error;
    },
  );

  setCachedValuePromise(
    readonlyHeaders,
    definition.key,
    entitiesKey,
    decisionPromise,
  );

  const decision = await decisionPromise;

  if (shouldReportValue(definition)) {
    // Overrides return before this point and report with `reason: "override"`.
    reportValue(definition.key, decision);
  }

  return decision;
}
