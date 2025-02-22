import {
  type FlagDefinitionType,
  type ProviderData,
  type FlagDefinitionsType,
} from '..';
import type { Decide, FlagDeclaration, JsonValue } from '../types';
import type { Flag, PrecomputedFlag, PagesRouterFlag } from './types';
import { normalizeOptions } from '../lib/normalize-options';
import { getPrecomputed } from './precompute';
import type { IncomingHttpHeaders } from 'node:http';
import { type ReadonlyHeaders } from '../spec-extension/adapters/headers';
import { type ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';
import { setSpanAttribute, trace } from '../lib/tracing';
import { core, getDecide, getIdentify } from '../lib/core';
import { getOrigin } from '../lib/origin';
import {
  sealCookies,
  sealHeaders,
  transformToHeaders,
} from './request-mapping';

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
    let requestCacheKey: Headers | IncomingHttpHeaders;

    if (options.request) {
      // pages router
      const headers = transformToHeaders(options.request.headers);
      readonlyHeaders = sealHeaders(headers);
      readonlyCookies = sealCookies(headers);
      requestCacheKey = options.request.headers;
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
      requestCacheKey = headersStore;
    }

    return core({
      readonlyHeaders,
      readonlyCookies,
      flagKey: definition.key,
      identify: options.identify,
      decide,
      requestCacheKey,
      defaultValue: definition.defaultValue,
      shouldReportValue: definition.config?.reportValue !== false,
    });
  };
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
