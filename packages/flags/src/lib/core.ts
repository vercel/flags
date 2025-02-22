/**
 * This file contains the core logic of the Flags SDK, which can be reused
 * by the implementations for different frameworks.
 */

import { isInternalNextError } from '../next/is-internal-next-error';
import { getCachedValuePromise, setCachedValuePromise } from './request-cache';
import { setSpanAttribute } from './tracing';
import type { ReadonlyHeaders } from '../spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';
import { internalReportValue, reportValue } from './report-value';
import { Decide, FlagDeclaration, Identify } from '../types';
import { getOverrides } from './overrides';

// Steps to evaluate a flag
//
// 1. check if precomputed, and use that if it is
//    -> we don't need to respect overrides here, they were already applied when precomputing
//    -> apply spanAttribute: method = "precomputed"
// 2. call run({ identify, headers, cookies }) <- run never respects percomputed values
// 2.1 use override from cookies if one exists, skip caching
//    -> apply spanAttribute: method = "override"
// 2.2 get entities from identify
//    -> dedupe and cache based on headers and cookies
// 2.3 create cache key by stringifying entities
// 2.4 use cached value if it exists
//    -> apply spanAttribute: method = "cached"
// 2.5 call decide({ headers, cookies, entities })
//    -> cache promise
//    -> apply spanAttribute: method = "decided"
//    -> apply internalReportValue: reason = "override"

const identifyArgsMap = new WeakMap<any, IdentifyArgs>();

type IdentifyArgs = Parameters<Exclude<Identify<any>, undefined>>;
function isIdentifyFunction<EntitiesType>(
  identify: Identify<any> | EntitiesType,
): identify is Identify<any> {
  return typeof identify === 'function';
}

async function getEntities<EntitiesType>(
  identify: Identify<any> | EntitiesType,
  dedupeCacheKey: any,
  readonlyHeaders: ReadonlyHeaders,
  readonlyCookies: ReadonlyRequestCookies,
): Promise<EntitiesType | undefined> {
  if (!identify) return undefined;
  if (!isIdentifyFunction(identify)) return identify;

  const args = identifyArgsMap.get(dedupeCacheKey);
  if (args) return identify(...args);

  const nextArgs: IdentifyArgs = [
    { headers: readonlyHeaders, cookies: readonlyCookies },
  ];
  identifyArgsMap.set(dedupeCacheKey, nextArgs);
  return identify(...nextArgs);
}

export function getDecide<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Decide<ValueType, EntitiesType> {
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

export function getIdentify<ValueType, EntitiesType>(
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

export async function core<ValueType, EntitiesType>({
  flagKey,
  getPrecomputed,
  identify,
  decide,
  requestCacheKey,
  defaultValue,
  readonlyHeaders,
  readonlyCookies,
  shouldReportValue,
}: {
  flagKey: string;
  getPrecomputed?: () => Promise<ValueType>;
  identify: EntitiesType | Identify<EntitiesType> | undefined;
  decide: Decide<ValueType, EntitiesType>;
  requestCacheKey: any;
  defaultValue?: ValueType;
  readonlyHeaders: ReadonlyHeaders;
  readonlyCookies: ReadonlyRequestCookies;
  shouldReportValue: boolean;
}) {
  if (typeof getPrecomputed === 'function') {
    const precomputed = await getPrecomputed();
    if (precomputed !== undefined) {
      setSpanAttribute('method', 'precomputed');
      return precomputed;
    }
  }

  const overrides = await getOverrides(
    readonlyCookies.get('vercel-flag-overrides')?.value,
  );
  const override = overrides ? overrides?.[flagKey] : null;
  if (overrides) {
    setSpanAttribute('method', 'override');
    internalReportValue(flagKey, override, { reason: 'override' });
    return override;
  }

  const entities = await getEntities(
    identify,
    requestCacheKey,
    readonlyHeaders,
    readonlyCookies,
  );

  const entitiesKey = JSON.stringify(entities) ?? '';

  const cachedValue = getCachedValuePromise(
    requestCacheKey,
    flagKey,
    entitiesKey,
  );

  if (cachedValue !== undefined) {
    setSpanAttribute('method', 'cached');
    return cachedValue;
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
        if (defaultValue !== undefined) return defaultValue;
        throw new Error(
          `flags: Flag "${flagKey}" must have a defaultValue or a decide function that returns a value`,
        );
      },
      (error: Error) => {
        if (isInternalNextError(error)) throw error;

        // try to recover if defaultValue is set
        if (defaultValue !== undefined) {
          if (process.env.NODE_ENV === 'development') {
            console.info(
              `flags: Flag "${flagKey}" is falling back to its defaultValue`,
            );
          } else {
            console.warn(
              `flags: Flag "${flagKey}" is falling back to its defaultValue after catching the following error`,
              error,
            );
          }
          return defaultValue;
        }
        console.warn(`flags: Flag "${flagKey}" could not be evaluated`);
        throw error;
      },
    );

  setCachedValuePromise(requestCacheKey, flagKey, entitiesKey, decisionPromise);

  const decision = await decisionPromise;

  // Only check `config.reportValue` for the result of `decide`.
  // No need to check it for `override` since the client will have
  // be short circuited in that case.
  if (shouldReportValue) reportValue(flagKey, decision);

  return decision;
}
