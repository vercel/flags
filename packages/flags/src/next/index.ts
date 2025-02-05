import { RequestCookies } from '@edge-runtime/cookies';
import {
  type FlagDefinitionType,
  type ProviderData,
  reportValue,
  type FlagDefinitionsType,
} from '..';
import type {
  Decide,
  FlagDeclaration,
  FlagParamsType,
  Identify,
  JsonValue,
  Origin,
} from '../types';
import type { Flag, PrecomputedFlag, PagesRouterFlag } from './types';
import { getOverrides } from './overrides';
import { normalizeOptions } from '../lib/normalize-options';
import { getPrecomputed } from './precompute';
import type { IncomingHttpHeaders } from 'node:http';
import {
  type ReadonlyHeaders,
  HeadersAdapter,
} from '../spec-extension/adapters/headers';
import {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from '../spec-extension/adapters/request-cookies';
import { setSpanAttribute, trace } from '../lib/tracing';
import { internalReportValue } from '../lib/report-value';
import { isInternalNextError } from './is-internal-next-error';

export type { Flag } from './types';

export {
  getPrecomputed,
  combine,
  serialize,
  deserialize,
  evaluate,
  precompute,
  generatePermutations,
} from './precompute';

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
  const map = evaluationCache.get(headers)?.get(flagKey);
  if (!map) return undefined;
  return map.get(entitiesKey);
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
      value.forEach((item) => headers.append(key, item));
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
  return function decide(params) {
    if (typeof definition.decide === 'function') {
      return definition.decide(params);
    }
    if (typeof definition.adapter?.decide === 'function') {
      return definition.adapter.decide({ key: definition.key, ...params });
    }
    throw new Error(
      `@vercel/flags: No decide function provided for ${definition.key}`,
    );
  };
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

function getRun<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
  decide: Decide<ValueType, EntitiesType>,
): Run<ValueType, EntitiesType> {
  // use cache to guarantee flags only decide once per request
  return async function run(options): Promise<ValueType> {
    let readonlyHeaders: ReadonlyHeaders;
    let readonlyCookies: ReadonlyRequestCookies;
    let dedupeCacheKey: Headers | IncomingHttpHeaders;

    if (options.request) {
      // pages router
      const headers = transformToHeaders(options.request.headers);
      readonlyHeaders = sealHeaders(headers);
      readonlyCookies = sealCookies(headers);
      dedupeCacheKey = options.request.headers;
    } else {
      // app router

      // async import required as turbopack errors in Pages Router
      // when next/headers is imported at the top-level
      const { headers, cookies } = await import('next/headers');

      const [headersStore, cookiesStore] = await Promise.all([
        headers(),
        cookies(),
      ]);
      readonlyHeaders = headersStore as ReadonlyHeaders;
      readonlyCookies = cookiesStore as ReadonlyRequestCookies;
      dedupeCacheKey = headersStore;
    }

    const overrides = await getOverrides(
      readonlyCookies.get('vercel-flag-overrides')?.value,
    );

    // the flag is being used in app router
    const entities = (await getEntities(
      options.identify,
      dedupeCacheKey,
      readonlyHeaders,
      readonlyCookies,
    )) as EntitiesType | undefined;

    // check cache
    const entitiesKey = JSON.stringify(entities) ?? '';

    const cachedValue = getCachedValuePromise(
      readonlyHeaders,
      definition.key,
      entitiesKey,
    );
    if (cachedValue !== undefined) {
      setSpanAttribute('method', 'cached');
      const value = await cachedValue;
      return value;
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

    // We use an async iife to ensure we can catch both sync and async errors of
    // the original decide function, as that one is not guaranted to be async.
    //
    // Also fall back to defaultValue when the decide function returns undefined or throws an error.
    const decisionPromise = (async () => {
      return decide({
        headers: readonlyHeaders,
        cookies: readonlyCookies,
        entities,
      });
    })()
      // catch errors in async "decide" functions
      .then<ValueType, ValueType>(
        (value) => {
          if (value !== undefined) return value;
          if (definition.defaultValue !== undefined)
            return definition.defaultValue;
          throw new Error(
            `@vercel/flags: Flag "${definition.key}" must have a defaultValue or a decide function that returns a value`,
          );
        },
        (error: Error) => {
          if (isInternalNextError(error)) throw error;

          // try to recover if defaultValue is set
          if (definition.defaultValue !== undefined) {
            if (process.env.NODE_ENV === 'development') {
              console.info(
                `@vercel/flags: Flag "${definition.key}" is falling back to its defaultValue`,
              );
            } else {
              console.warn(
                `@vercel/flags: Flag "${definition.key}" is falling back to its defaultValue after catching the following error`,
                error,
              );
            }
            return definition.defaultValue;
          }
          console.warn(
            `@vercel/flags: Flag "${definition.key}" could not be evaluated`,
          );
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
 * In both cases this function also calls the `reportValue` function of `@vercel/flags` so the evaluated flag shows up in Runtime Logs and is available for use with Web Analytics custom server-side events.
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

  const flag = trace(
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
          return getPrecomputed(
            flag,
            precomputedGroup,
            precomputedCode,
            secret,
          );
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

  flag.key = definition.key;
  flag.defaultValue = definition.defaultValue;
  flag.origin = origin;
  flag.options = normalizeOptions<ValueType>(definition.options);
  flag.description = definition.description;
  flag.identify = identify
    ? trace(identify, {
        isVerboseTrace: false,
        name: 'identify',
        attributes: { key: definition.key },
      })
    : identify;
  flag.decide = trace(decide, {
    isVerboseTrace: false,
    name: 'decide',
    attributes: { key: definition.key },
  });
  flag.run = trace(run, {
    isVerboseTrace: false,
    name: 'run',
    attributes: { key: definition.key },
  });

  return flag;
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

export { dedupe } from './dedupe';
