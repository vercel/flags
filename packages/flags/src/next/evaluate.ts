import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingHttpHeaders } from 'node:http';
import { RequestCookies } from '@edge-runtime/cookies';
import { isInternalNextError } from '../lib/is-internal-next-error';
import { internalReportValue, reportValue } from '../lib/report-value';
import { setSpanAttribute, trace } from '../lib/tracing';
import {
  HeadersAdapter,
  type ReadonlyHeaders,
} from '../spec-extension/adapters/headers';
import {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from '../spec-extension/adapters/request-cookies';
import type {
  Adapter,
  Decide,
  FlagDeclaration,
  FlagParamsType,
  ResolvedFlagDeclaration,
} from '../types';
import { getOverrides } from './overrides';
import type { Flag, FlagRequest } from './types';

// Internal markers stamped on the flag api by `flag()`. Read by `evaluate()`
// to partition flags into adapter groups.
//
// - BULK_IDENTIFY_REF: the raw identify source for reference-equality
//   comparison across flags. The wrapped `api.identify` is created per
//   `flag()` call, so it can't be used for grouping.
// - BULKABLE: whether the flag can participate in adapter-level bulk
//   evaluation. An inline `definition.decide` disqualifies the flag
//   because `getDecide` prefers it over the adapter's decide.
export const BULK_IDENTIFY_REF = Symbol('flags.bulkIdentifyRef');
export const BULKABLE = Symbol('flags.bulkable');

// a map of (headers, flagKey, entitiesKey) => value
const evaluationCache = new WeakMap<
  Headers | IncomingHttpHeaders,
  Map</* flagKey */ string, Map</* entitiesKey */ string, any>>
>();

function getCachedValuePromise(
  /**
   * supports Headers for App Router and IncomingHttpHeaders for Pages Router
   */
  headers: Headers | IncomingHttpHeaders,
  flagKey: string,
  entitiesKey: string,
): any {
  return evaluationCache.get(headers)?.get(flagKey)?.get(entitiesKey);
}

function setCachedValuePromise(
  /**
   * supports Headers for App Router and IncomingHttpHeaders for Pages Router
   */
  headers: Headers | IncomingHttpHeaders,
  flagKey: string,
  entitiesKey: string,
  flagValue: any,
): any {
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

type IdentifyArgs = Parameters<
  Exclude<FlagDeclaration<any, any>['identify'], undefined>
>;
const transformMap = new WeakMap<IncomingHttpHeaders, Headers>();
const headersMap = new WeakMap<Headers, ReadonlyHeaders>();
const cookiesMap = new WeakMap<Headers, ReadonlyRequestCookies>();
const identifyArgsMap = new WeakMap<
  Headers | IncomingHttpHeaders,
  IdentifyArgs
>();

/**
 * Transforms IncomingHttpHeaders to Headers
 */
function transformToHeaders(
  incomingHeaders: IncomingHttpHeaders | Headers,
): Headers {
  if (incomingHeaders instanceof Headers) return incomingHeaders;

  const cached = transformMap.get(incomingHeaders);
  if (cached !== undefined) return cached;

  const headers = new Headers();
  for (const [key, value] of Object.entries(incomingHeaders)) {
    if (Array.isArray(value)) {
      // If the value is an array, add each item separately
      value.forEach((item) => {
        headers.append(key, item);
      });
    } else if (value !== undefined) {
      // If it's a single value, add it directly
      headers.append(key, value);
    }
  }

  transformMap.set(incomingHeaders, headers);
  return headers;
}

function sealHeaders(headers: Headers): ReadonlyHeaders {
  const cached = headersMap.get(headers);
  if (cached !== undefined) return cached;

  const sealed = HeadersAdapter.seal(headers);
  headersMap.set(headers, sealed);
  return sealed;
}

function sealCookies(headers: Headers): ReadonlyRequestCookies {
  const cached = cookiesMap.get(headers);
  if (cached !== undefined) return cached;

  const sealed = RequestCookiesAdapter.seal(new RequestCookies(headers));
  cookiesMap.set(headers, sealed);
  return sealed;
}

function isIdentifyFunction<ValueType, EntitiesType>(
  identify: FlagDeclaration<ValueType, EntitiesType>['identify'] | EntitiesType,
): identify is FlagDeclaration<ValueType, EntitiesType>['identify'] {
  return typeof identify === 'function';
}

async function getEntities<ValueType, EntitiesType>(
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
 * Reads and decrypts the `vercel-flag-overrides` cookie. Returns `null` when
 * the cookie is absent or empty (skipping the decrypt microtask).
 */
function readOverrides(
  cookies: ReadonlyRequestCookies,
): Promise<Record<string, any> | null> {
  // skip microtask if cookie does not exist or is empty
  const override = cookies.get('vercel-flag-overrides')?.value;
  return typeof override === 'string' && override !== ''
    ? getOverrides(override)
    : Promise.resolve(null);
}

interface BulkStoreData {
  headers: ReadonlyHeaders;
  cookies: ReadonlyRequestCookies;
  dedupeCacheKey: Headers | IncomingHttpHeaders;
  overrides: Record<string, any> | null;
}

const bulkStore = new AsyncLocalStorage<BulkStoreData>();

let headersModulePromise: Promise<typeof import('next/headers')> | undefined;
let headersModule: typeof import('next/headers') | undefined;

/**
 * Subset of a flag declaration / flag function that `applyResult` reads.
 * `FlagDeclaration` (passed from `getRun`) and the `api` (passed from
 * `evaluate()`) both satisfy this shape after `flag()` stamps `config` onto
 * the api.
 */
type FlagInfo<ValueType> = {
  key: string;
  defaultValue?: ValueType;
  config?: { reportValue?: boolean };
  adapter?: { config?: { reportValue?: boolean } };
};

function hasOverride(
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
 * Shared by `getRun` (single-flag path) and `evaluate()` (group path). Handles,
 * in order: cache hit → override → produce → defaultValue/error normalization
 * → cache write → reportValue. Override and cache writes write to the same
 * `evaluationCache` either path uses, so a subsequent `flagFn()` in the same
 * request hits cache regardless of which path populated it.
 */
async function applyResult<ValueType>(args: {
  definition: FlagInfo<ValueType>;
  readonlyHeaders: ReadonlyHeaders;
  entitiesKey: string;
  overrides: Record<string, any> | null;
  produce: () => ValueType | PromiseLike<ValueType>;
}): Promise<ValueType> {
  const { definition, readonlyHeaders, entitiesKey, overrides, produce } = args;

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
      if (isInternalNextError(error)) throw error;

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

type Run<ValueType, EntitiesType> = (options: {
  entities?: EntitiesType;
  identify?:
    | FlagDeclaration<ValueType, EntitiesType>['identify']
    | EntitiesType;
  /**
   * For use outside App Router only, e.g. Pages Router or routing middleware
   */
  request?: FlagRequest;
}) => Promise<ValueType>;

/**
 * Builds the runtime function used by a single flag. Handles Pages Router,
 * App Router, and reuse of pre-read data when called from inside `evaluate()`.
 */
export function getRun<ValueType, EntitiesType>(
  definition: ResolvedFlagDeclaration<ValueType, EntitiesType>,
  decide: Decide<ValueType, EntitiesType>,
): Run<ValueType, EntitiesType> {
  // use cache to guarantee flags only decide once per request
  return async function run(options): Promise<ValueType> {
    let readonlyHeaders: ReadonlyHeaders;
    let readonlyCookies: ReadonlyRequestCookies;
    let dedupeCacheKey: Headers | IncomingHttpHeaders;

    // Check if running inside evaluate() — reuse pre-read headers/cookies/overrides
    const bulkData = bulkStore.getStore();

    let overrides: Record<string, any> | null;

    if (options.request) {
      // pages router, or a NextRequest / Web Request (e.g. routing middleware)
      const headers = transformToHeaders(options.request.headers);
      readonlyHeaders = sealHeaders(headers);
      readonlyCookies = sealCookies(headers);
      dedupeCacheKey = options.request.headers;

      overrides = await readOverrides(readonlyCookies);
    } else if (bulkData) {
      // app router — evaluate() mode, everything pre-read
      readonlyHeaders = bulkData.headers;
      readonlyCookies = bulkData.cookies;
      dedupeCacheKey = bulkData.dedupeCacheKey;
      overrides = bulkData.overrides;
    } else {
      // app router

      // async import required as turbopack errors in Pages Router
      // when next/headers is imported at the top-level.
      //
      // cache import so we don't await on every call since this adds
      // additional microtask queue overhead
      if (!headersModulePromise) headersModulePromise = import('next/headers');
      if (!headersModule) headersModule = await headersModulePromise;
      const { headers, cookies } = headersModule;

      const [headersStore, cookiesStore] = await Promise.all([
        headers(),
        cookies(),
      ]);
      readonlyHeaders = headersStore as ReadonlyHeaders;
      readonlyCookies = cookiesStore as ReadonlyRequestCookies;
      dedupeCacheKey = headersStore;

      overrides = await readOverrides(readonlyCookies);
    }

    // the flag is being used in app router
    // skip microtask if identify does not exist
    const entities = options.identify
      ? ((await getEntities(
          options.identify,
          dedupeCacheKey,
          readonlyHeaders,
          readonlyCookies,
        )) as EntitiesType | undefined)
      : undefined;

    const entitiesKey = JSON.stringify(entities) ?? '';

    return applyResult({
      definition,
      readonlyHeaders,
      entitiesKey,
      overrides,
      produce: () =>
        decide({
          // @ts-expect-error TypeScript will not be able to process `getPrecomputed` when added to `Decide`. It is, however, part of the `Adapter` type
          defaultValue: definition.defaultValue,
          headers: readonlyHeaders,
          cookies: readonlyCookies,
          entities,
        }),
    });
  };
}

// Distributive value extraction. `Flag` is itself a union
// (AppRouterFlag | PagesRouterFlag | PrecomputedFlag), so inferring V against
// a union element type only works when the conditional's check type is a
// naked type parameter — hence the helper.
type BulkValue<F> = F extends Flag<infer V, any> ? V : never;

type EvaluateRequest = FlagRequest;

/**
 * Resolves a set of flags in a single call.
 *
 * Pre-reads headers, cookies, and the override cookie once for the whole
 * batch, then partitions flags by `(adapterId, identify)` so adapters that
 * implement `bulkDecide` can evaluate an entire group through a single call.
 * Flags whose adapters don't opt into bulk evaluation (no `adapterId` or no
 * `bulkDecide`) and flags with an inline `decide` fall back to the per-flag
 * path — they still benefit from the shared pre-read of headers, cookies, and
 * overrides.
 *
 * Accepts either an array of flags (positional results) or an object whose
 * values are flags (keyed results).
 *
 * Pass a `request` as the second argument when calling outside App Router —
 * an `IncomingMessage` from Pages Router (`getServerSideProps`, API routes)
 * or a `NextRequest` / Web `Request` from routing middleware. Without it,
 * `evaluate()` reads from `next/headers`, which is only available in App
 * Router and routing middleware.
 */
export function evaluate<const T extends readonly Flag<any, any>[]>(
  flags: T,
  request?: EvaluateRequest,
): Promise<{ [K in keyof T]: BulkValue<T[K]> }>;
export function evaluate<T extends Record<string, Flag<any, any>>>(
  flags: T,
  request?: EvaluateRequest,
): Promise<{ [K in keyof T]: BulkValue<T[K]> }>;
export function evaluate(
  flags: Record<string, Flag<any, any>> | readonly Flag<any, any>[],
  request?: EvaluateRequest,
): Promise<any> {
  // Non-async wrapper so the returned promise is the traced one verbatim — no
  // extra microtask. `trace` short-circuits to `evaluateImpl` when no tracer
  // is registered.
  return tracedEvaluate(flags, request);
}

const tracedEvaluate = trace(evaluateImpl, {
  name: 'evaluate',
  isVerboseTrace: false,
  attributesSuccess: (result) => ({
    flagCount: Array.isArray(result)
      ? result.length
      : Object.keys(result).length,
  }),
});

async function evaluateImpl(
  flags: Record<string, Flag<any, any>> | readonly Flag<any, any>[],
  request?: EvaluateRequest,
): Promise<any> {
  // Skip the `next/headers` read when there's nothing to evaluate. This also
  // lets `precompute([])` return `__no_flags__` outside a request scope (e.g.
  // during static generation), which is the documented behavior of an empty
  // precompute group.
  if (
    Array.isArray(flags) ? flags.length === 0 : Object.keys(flags).length === 0
  ) {
    return Array.isArray(flags) ? [] : {};
  }

  let readonlyHeaders: ReadonlyHeaders;
  let readonlyCookies: ReadonlyRequestCookies;
  let dedupeCacheKey: Headers | IncomingHttpHeaders;

  if (request) {
    // Derive headers/cookies from the request, skipping the `next/headers`
    // import. Discriminate by whether `.headers` is already a `Headers`
    // instance (NextRequest / Web Request) or an `IncomingHttpHeaders` plain
    // object (Pages Router `IncomingMessage`).
    const headers =
      request.headers instanceof Headers
        ? request.headers
        : transformToHeaders(request.headers);
    readonlyHeaders = sealHeaders(headers);
    readonlyCookies = sealCookies(headers);
    dedupeCacheKey = request.headers;
  } else {
    // app router — read headers & cookies via `next/headers`.
    if (!headersModulePromise) headersModulePromise = import('next/headers');
    if (!headersModule) headersModule = await headersModulePromise;
    const { headers, cookies } = headersModule;

    const [headersStore, cookiesStore] = await Promise.all([
      headers(),
      cookies(),
    ]);

    readonlyHeaders = headersStore as ReadonlyHeaders;
    readonlyCookies = cookiesStore as ReadonlyRequestCookies;
    dedupeCacheKey = headersStore;
  }

  // Read overrides once
  const overrides = await readOverrides(readonlyCookies);

  const storeData: BulkStoreData = {
    headers: readonlyHeaders,
    cookies: readonlyCookies,
    dedupeCacheKey,
    overrides,
  };

  return bulkStore.run(storeData, async () => {
    const entries = Object.entries(flags);

    const standalone: { name: string; flagFn: Flag<any, any> }[] = [];
    // adapterId -> identifyRef -> { adapter, entries }
    const groups = new Map<
      string | symbol,
      Map<
        unknown,
        {
          adapter: Adapter<any, any>;
          entries: { name: string; flagFn: Flag<any, any> }[];
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
              // the same one `getRun` uses (`request.headers` for Pages Router,
              // the `headers()` store for App Router), so any flag called
              // individually before/after `evaluate()` reuses the cached
              // identify args from `identifyArgsMap`.
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
            standalone.map(({ flagFn }) => flagFn()),
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
  });
}
