import type { IncomingHttpHeaders } from 'node:http';
import type { FlagDefinitionType, ProviderData } from '..';
import {
  attachFlagMetadata,
  getProviderData as engineGetProviderData,
  getDecide,
  getIdentify,
  getOrigin,
  resolveFlag,
  sealCookies,
  sealHeaders,
} from '../engine';
import type { RequestContext } from '../engine/types';
import { setSpanAttribute, trace } from '../lib/tracing';
import type { ReadonlyHeaders } from '../spec-extension/adapters/headers';
import type { ReadonlyRequestCookies } from '../spec-extension/adapters/request-cookies';
import type { Decide, FlagDeclaration, Identify, JsonValue } from '../types';
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

// Pages Router: transform IncomingHttpHeaders to Headers
const transformMap = new WeakMap<IncomingHttpHeaders, Headers>();

function transformToHeaders(incomingHeaders: IncomingHttpHeaders): Headers {
  const cached = transformMap.get(incomingHeaders);
  if (cached !== undefined) return cached;

  const headers = new Headers();
  for (const [key, value] of Object.entries(incomingHeaders)) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        headers.append(key, item);
      });
    } else if (value !== undefined) {
      headers.append(key, value);
    }
  }

  transformMap.set(incomingHeaders, headers);
  return headers;
}

// Lazy import of next/headers for App Router
let headersModulePromise: Promise<typeof import('next/headers')> | undefined;
let headersModule: typeof import('next/headers') | undefined;

async function getAppRouterContext(): Promise<RequestContext> {
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
  return {
    headers: headersStore as ReadonlyHeaders,
    cookies: cookiesStore as ReadonlyRequestCookies,
    cacheKey: headersStore,
  };
}

function getPagesRouterContext(
  request: Parameters<PagesRouterFlag<any, any>>[0],
): RequestContext {
  const headers = transformToHeaders(request.headers);
  return {
    headers: sealHeaders(headers),
    cookies: sealCookies(headers),
    cacheKey: request.headers,
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
  const origin = getOrigin(definition);

  function resolveFlagOptions(identifyOverride?: Identify<EntitiesType>) {
    return {
      key: definition.key,
      defaultValue: definition.defaultValue,
      config: definition.config,
      decide,
      identify: identifyOverride ?? identify,
      decryptOverrides: (cookie: string) => getOverrides(cookie),
      shouldRethrowError: isInternalNextError,
    };
  }

  const run: Run<ValueType, EntitiesType> = async function run(
    options,
  ): Promise<ValueType> {
    const context = options.request
      ? getPagesRouterContext(options.request)
      : await getAppRouterContext();

    // .run() allows passing either a function or static entities
    let identifyFn: Identify<EntitiesType> | undefined;
    if (options.identify) {
      if (typeof options.identify === 'function') {
        identifyFn = options.identify as Identify<EntitiesType>;
      } else {
        // Wrap static entities as an identify function
        identifyFn = () => options.identify as EntitiesType;
      }
    }

    return resolveFlag<ValueType, EntitiesType>(
      context,
      resolveFlagOptions(identifyFn),
    );
  };

  const api = trace(
    async (...args: any[]) => {
      // Default method, may be overwritten by `getPrecomputed` or `resolveFlag`
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

  attachFlagMetadata(api, definition, { decide, identify, origin });
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
  return engineGetProviderData(flags);
}

export { createFlagsDiscoveryEndpoint } from './create-flags-discovery-endpoint';
export { clearDedupeCacheForCurrentRequest, dedupe } from './dedupe';
