import { AsyncLocalStorage } from 'node:async_hooks';
import type { IncomingHttpHeaders } from 'node:http';
import { RequestCookies } from '@edge-runtime/cookies';
import {
  type FlagDefinitionsType,
  type FlagDefinitionType,
  type ProviderData,
  reportValue,
} from '..';
import { normalizeOptions } from '../lib/normalize-options';
import { internalReportValue } from '../lib/report-value';
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
  Identify,
  JsonValue,
  Origin,
} from '../types';
import { isInternalNextError } from './is-internal-next-error';
import { getOverrides } from './overrides';
import { getPrecomputed } from './precompute';
import type { Flag, PagesRouterFlag, PrecomputedFlag } from './types';

export {
  combine,
  deserialize,
  evaluate,
  generatePermutations,
  getPrecomputed,
  precompute,
  serialize,
} from './precompute';
export type { Flag } from './types';

// Internal markers stamped on the flag api by `flag()`. Read by `bulk()`.
// Kept off the public FlagMeta type — they're an implementation detail of
// how we partition flags for bulk evaluation.
const BULK_IDENTIFY_REF = Symbol('flags.bulkIdentifyRef');
const BULKABLE = Symbol('flags.bulkable');

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
function transformToHeaders(incomingHeaders: IncomingHttpHeaders): Headers {
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

function getDecide<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Decide<ValueType, EntitiesType> {
  if (definition.adapter && typeof definition.adapter.decide !== 'function') {
    throw new Error(
      `flags: You passed an adapter that does not have a "decide" method for flag "${definition.key}". Did you pass "adapter: exampleAdapter" instead of "adapter: exampleAdapter()"?`,
    );
  }

  if (
    typeof definition.decide !== 'function' &&
    typeof definition.adapter?.decide !== 'function'
  ) {
    throw new Error(
      `flags: You passed a flag declaration that does not have a "decide" method for flag "${definition.key}"`,
    );
  }

  return function decide(params) {
    if (typeof definition.decide === 'function') {
      return definition.decide(params);
    }
    if (typeof definition.adapter?.decide === 'function') {
      return definition.adapter.decide({ key: definition.key, ...params });
    }
    throw new Error(`flags: No decide function provided for ${definition.key}`);
  };
}

interface BulkStoreData {
  headers: ReadonlyHeaders;
  cookies: ReadonlyRequestCookies;
  dedupeCacheKey: Headers;
  overrides: Record<string, any> | null;
}

const bulkStore = new AsyncLocalStorage<BulkStoreData>();

type BulkFlags = Record<string, Flag<any, any>>;
type BulkResult<T extends BulkFlags> = {
  [K in keyof T]: T[K] extends Flag<infer V, any> ? V : never;
};

export async function bulk<T extends BulkFlags>(
  flags: T,
): Promise<BulkResult<T>> {
  // Read headers & cookies once
  if (!headersModulePromise) headersModulePromise = import('next/headers');
  if (!headersModule) headersModule = await headersModulePromise;
  const { headers, cookies } = headersModule;

  const [headersStore, cookiesStore] = await Promise.all([
    headers(),
    cookies(),
  ]);

  const readonlyHeaders = headersStore as ReadonlyHeaders;
  const readonlyCookies = cookiesStore as ReadonlyRequestCookies;

  // Read overrides once
  const override = readonlyCookies.get('vercel-flag-overrides')?.value;
  const overrides =
    typeof override === 'string' && override !== ''
      ? await getOverrides(override)
      : null;

  const storeData: BulkStoreData = {
    headers: readonlyHeaders,
    cookies: readonlyCookies,
    dedupeCacheKey: headersStore,
    overrides,
  };

  // Run all flags within the bulk store context. We partition flags by
  // (adapterId, identifyRef) so adapters that implement `bulkDecide` can
  // evaluate an entire group in a single call. Flags whose adapters don't
  // opt into bulk (no `adapterId` or no `bulkDecide`) and flags with an
  // inline `decide` fall back to the per-flag `flagFn()` path — which still
  // benefits from the pre-read headers/cookies/overrides via `bulkStore`.
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
    const groupPromises: Promise<void>[] = [];

    for (const byIdentify of groups.values()) {
      for (const [identifyRef, { adapter, entries: list }] of byIdentify) {
        groupPromises.push(
          (async () => {
            // Resolve entities once for the entire group. The dedupe key is
            // the raw `headersStore` (same key getRun uses), so any flag
            // called individually after `bulk()` reuses the cached identify
            // args from `identifyArgsMap`.
            const entities = identifyRef
              ? await getEntities(
                  identifyRef as any,
                  headersStore,
                  readonlyHeaders,
                  readonlyCookies,
                )
              : undefined;
            const entitiesKey = JSON.stringify(entities) ?? '';

            // Skip flags already resolved this request — `applyResult` would
            // discard the bulk result for them anyway. If every flag in the
            // group is cached, the adapter call is avoided entirely.
            const uncached = list.filter(
              ({ flagFn }) =>
                getCachedValuePromise(
                  readonlyHeaders,
                  flagFn.key,
                  entitiesKey,
                ) === undefined,
            );

            // Call bulkDecide. If it throws, every uncached flag still goes
            // through `applyResult` — its producer just rethrows, so the
            // catch arm handles the per-flag defaultValue fallback (or
            // rejects for flags without a defaultValue).
            let bulkResult: Record<string, any> | null = null;
            let bulkError: unknown = null;
            if (uncached.length > 0) {
              try {
                bulkResult = await adapter.bulkDecide!({
                  flags: uncached.map(({ flagFn }) => ({
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
          })(),
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

    const result = {} as BulkResult<T>;
    for (const [name] of entries) {
      (result as any)[name] = valuesByName[name];
    }
    return result;
  });
}

function getIdentify<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Identify<EntitiesType> {
  return function identify(params) {
    if (typeof definition.identify === 'function') {
      return definition.identify(params);
    }
    if (typeof definition.adapter?.identify === 'function') {
      return definition.adapter.identify(params);
    }
    return definition.identify;
  };
}

type Run<ValueType, EntitiesType> = (options: {
  entities?: EntitiesType;
  identify?:
    | FlagDeclaration<ValueType, EntitiesType>['identify']
    | EntitiesType;
  /**
   * For Pages Router only
   */
  request?: Parameters<PagesRouterFlag<ValueType, EntitiesType>>[0];
}) => Promise<ValueType>;

let headersModulePromise: Promise<typeof import('next/headers')> | undefined;
let headersModule: typeof import('next/headers') | undefined;

/**
 * Subset of a flag declaration / flag function that `applyResult` reads.
 * `FlagDeclaration` (passed from `getRun`) and the `api` (passed from `bulk()`)
 * both satisfy this shape after `flag()` stamps `config` onto the api.
 */
type FlagInfo<ValueType> = {
  key: string;
  defaultValue?: ValueType;
  config?: { reportValue?: boolean };
};

/**
 * Finalize a flag evaluation given an already-computed `entitiesKey`.
 *
 * Shared by `getRun` (single-flag path) and `bulk()` (group path). Handles, in
 * order: cache hit → override → produce → defaultValue/error normalization →
 * cache write → reportValue. Override and cache writes write to the same
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

  if (overrides && overrides[definition.key] !== undefined) {
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

  if (definition.config?.reportValue !== false) {
    // Only check `config.reportValue` for the result of `decide`.
    // No need to check it for `override` since the client will have
    // be short circuited in that case.
    reportValue(definition.key, decision);
  }

  return decision;
}

function getRun<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
  decide: Decide<ValueType, EntitiesType>,
): Run<ValueType, EntitiesType> {
  // use cache to guarantee flags only decide once per request
  return async function run(options): Promise<ValueType> {
    let readonlyHeaders: ReadonlyHeaders;
    let readonlyCookies: ReadonlyRequestCookies;
    let dedupeCacheKey: Headers | IncomingHttpHeaders;

    // Check if running inside bulk() — reuse pre-read headers/cookies/overrides
    const bulkData = bulkStore.getStore();

    let overrides: Record<string, any> | null;

    if (options.request) {
      // pages router
      const headers = transformToHeaders(options.request.headers);
      readonlyHeaders = sealHeaders(headers);
      readonlyCookies = sealCookies(headers);
      dedupeCacheKey = options.request.headers;

      // skip microtask if cookie does not exist or is empty
      const override = readonlyCookies.get('vercel-flag-overrides')?.value;
      overrides =
        typeof override === 'string' && override !== ''
          ? await getOverrides(override)
          : null;
    } else if (bulkData) {
      // app router — bulk mode, everything pre-read
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

      // skip microtask if cookie does not exist or is empty
      const override = readonlyCookies.get('vercel-flag-overrides')?.value;
      overrides =
        typeof override === 'string' && override !== ''
          ? await getOverrides(override)
          : null;
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

function getOrigin<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): string | Origin | undefined {
  if (definition.origin) return definition.origin;
  if (typeof definition.adapter?.origin === 'function')
    return definition.adapter.origin(definition.key);
  return definition.adapter?.origin;
}

/**
 * Declares a feature flag.
 *
 * This a feature flag function. When that function is called it will call the flag's `decide` function and return the result.
 *
 * If an override set by Vercel Toolbar, or more precisely if the `vercel-flag-overrides` cookie, is present then the `decide` function will not be called and the value of the override will be returned instead.
 *
 * In both cases this function also calls the `reportValue` function of `flags` so the evaluated flag shows up in Runtime Logs and is available for use with Web Analytics custom server-side events.
 *
 *
 * @param definition - Information about the feature flag.
 * @returns - A feature flag declaration
 */
export function flag<
  ValueType extends JsonValue = boolean | string | number,
  EntitiesType = any,
>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Flag<ValueType, EntitiesType> {
  const decide = getDecide<ValueType, EntitiesType>(definition);
  const identify = getIdentify<ValueType, EntitiesType>(definition);
  const run = getRun<ValueType, EntitiesType>(definition, decide);
  const origin = getOrigin(definition);

  const api = trace(
    async (...args: any[]) => {
      // Default method, may be overwritten by `getPrecomputed` or `run`
      // which is why we must not trace them directly in here,
      // as the attribute should be part of the `flag` function.
      setSpanAttribute('method', 'decided');

      // the flag was precomputed, works for both App Router and Pages Router
      if (typeof args[0] === 'string' && Array.isArray(args[1])) {
        const [precomputedCode, precomputedGroup, secret] = args as Parameters<
          PrecomputedFlag<ValueType, EntitiesType>
        >;
        if (precomputedCode && precomputedGroup) {
          setSpanAttribute('method', 'precomputed');
          const value = await getPrecomputed(
            api,
            precomputedGroup,
            precomputedCode,
            secret,
          );
          if (value === undefined) return definition.defaultValue!;
          return value;
        }
      }

      // check if we're using the flag in pages router
      //
      // ideally we'd check args[0] instanceof IncomingMessage, but that leads
      // to build time errors in the host application due to Edge Runtime,
      // so we check for headers on the first arg instead, which indicates an
      // IncomingMessage
      if (args[0] && typeof args[0] === 'object' && 'headers' in args[0]) {
        const [request] = args as Parameters<
          PagesRouterFlag<ValueType, EntitiesType>
        >;
        return run({ identify, request });
      }

      // the flag is being used in app router
      return run({ identify, request: undefined });
    },
    {
      name: 'flag',
      isVerboseTrace: false,
      attributes: { key: definition.key },
    },
  ) as Flag<ValueType, EntitiesType>;

  api.key = definition.key;
  api.defaultValue = definition.defaultValue;
  api.origin = origin;
  api.options = normalizeOptions<ValueType>(definition.options);
  api.description = definition.description;
  api.identify = identify
    ? trace(identify, {
        isVerboseTrace: false,
        name: 'identify',
        attributes: { key: definition.key },
      })
    : identify;
  api.decide = trace(decide, {
    isVerboseTrace: false,
    name: 'decide',
    attributes: { key: definition.key },
  });
  api.run = trace(run, {
    isVerboseTrace: false,
    name: 'run',
    attributes: { key: definition.key },
  });
  api.adapter = definition.adapter;
  api.config = definition.config;

  // Internal markers used by `bulk()` to partition flags into adapter groups.
  // - BULK_IDENTIFY_REF: the raw identify source for reference-equality
  //   comparison across flags. `api.identify` is a wrapper created per
  //   `flag()` call, so it can't be used for grouping.
  // - BULKABLE: whether the flag can participate in adapter-level bulk
  //   evaluation. An inline `definition.decide` disqualifies the flag
  //   because `getDecide` prefers it over the adapter's decide.
  (api as any)[BULK_IDENTIFY_REF] =
    definition.identify ?? definition.adapter?.identify ?? null;
  (api as any)[BULKABLE] =
    !definition.decide &&
    !!definition.adapter?.bulkDecide &&
    definition.adapter.adapterId !== undefined;

  return api;
}

export type KeyedFlagDefinitionType = { key: string } & FlagDefinitionType;

// -----------------------------------------------------------------------------

/**
 * Takes an object whose values are feature flag declarations and
 * turns them into ProviderData to be returned through `/.well-known/vercel/flags`.
 */
export function getProviderData(
  flags: Record<
    string,
    // accept an unknown array
    KeyedFlagDefinitionType | readonly unknown[]
  >,
): ProviderData {
  const definitions = Object.values(flags)
    // filter out precomputed arrays
    .filter((i): i is KeyedFlagDefinitionType => !Array.isArray(i))
    .reduce<FlagDefinitionsType>((acc, d) => {
      // maps the existing type from the facet definitions to the type
      // the toolbar expects
      acc[d.key] = {
        options: d.options,
        origin: d.origin,
        description: d.description,
        defaultValue: d.defaultValue,
        declaredInCode: true,
      } satisfies FlagDefinitionType;
      return acc;
    }, {});

  return { definitions, hints: [] };
}

export { createFlagsDiscoveryEndpoint } from './create-flags-discovery-endpoint';
export { clearDedupeCacheForCurrentRequest, dedupe } from './dedupe';
