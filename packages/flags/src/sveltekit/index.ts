import { AsyncLocalStorage } from 'node:async_hooks';
import {
  error,
  type Handle,
  json,
  type RequestEvent,
  type RequestHandler,
} from '@sveltejs/kit';
import {
  decryptFlagDefinitions as _decryptFlagDefinitions,
  decryptFlagValues as _decryptFlagValues,
  decryptOverrides as _decryptOverrides,
  encryptFlagDefinitions as _encryptFlagDefinitions,
  encryptFlagValues as _encryptFlagValues,
  encryptOverrides as _encryptOverrides,
  type ApiData,
  type FlagDefinitionsType,
  type JsonValue,
  safeJsonStringify,
  verifyAccess,
  version,
} from '..';
import { normalizeOptions } from '../lib/normalize-options';
import { handleDiscoveryRequest } from '../shared/discovery';
import { BULK_IDENTIFY_REF, BULKABLE } from '../shared/evaluate';
import { applyResult, getEntities, getUsedFlags } from '../shared/evaluation';
import {
  getDecide,
  getIdentify,
  getOrigin,
  resolveAdapter,
} from '../shared/flag-meta';
import { readOverrides } from '../shared/overrides';
import { sealCookies, sealHeaders } from '../shared/seal';
import type {
  FlagDeclaration,
  FlagOverridesType,
  FlagValuesType,
  ResolvedFlagDeclaration,
} from '../types';
import { tryGetSecret } from './env';
import {
  generatePermutations as _generatePermutations,
  precompute as _precompute,
  getPrecomputed,
} from './precompute';
import type { Flag, FlagsArray } from './types';

export { evaluate } from './evaluate';

type PromisesMap<T> = {
  [K in keyof T]: Promise<T[K]>;
};

async function resolveObjectPromises<T>(obj: PromisesMap<T>): Promise<T> {
  // Convert the object into an array of [key, promise] pairs
  const entries = Object.entries(obj) as [keyof T, Promise<any>][];

  // Use Promise.all to wait for all the promises to resolve
  const resolvedEntries = await Promise.all(
    entries.map(async ([key, promise]) => {
      const value = await promise;
      return [key, value] as [keyof T, T[keyof T]];
    }),
  );

  // Convert the array of resolved [key, value] pairs back into an object
  return Object.fromEntries(resolvedEntries) as T;
}

/**
 * Used when a flag is called outside of a request context, i.e. outside of the lifecycle of the `handle` hook.
 * This could be the case when the flag is called from routing functions.
 */
const requestMap = new WeakMap<Request, AsyncLocalContext>();

/**
 * Declares a feature flag
 */
export function flag<
  ValueType extends JsonValue = boolean | string | number,
  EntitiesType = any,
>(definition: FlagDeclaration<ValueType, EntitiesType>): Flag<ValueType> {
  // Allow passing the adapter factory directly (`adapter: vercelAdapter`) as a
  // shorthand for calling it (`adapter: vercelAdapter()`). Resolve it once here.
  const adapter = resolveAdapter(definition);
  const resolvedDefinition = {
    ...definition,
    adapter,
  } as ResolvedFlagDeclaration<ValueType, EntitiesType>;

  const decide = getDecide<ValueType, EntitiesType>(resolvedDefinition);
  const identify = getIdentify<ValueType, EntitiesType>(resolvedDefinition);
  const origin = getOrigin(resolvedDefinition);

  const flagImpl = async function flagImpl(
    requestOrCode?: string | Request,
    flagsArrayOrSecret?: string | Flag<any>[],
  ): Promise<ValueType> {
    let store = flagStorage.getStore();

    if (!store) {
      if (requestOrCode instanceof Request) {
        store = requestMap.get(requestOrCode);
        if (!store) {
          store = createContext(
            requestOrCode,
            (flagsArrayOrSecret as string) ?? (await tryGetSecret()),
          );
          requestMap.set(requestOrCode, store);
        }
      } else {
        throw new Error('flags: Neither context found nor Request provided');
      }
    }

    if (
      typeof requestOrCode === 'string' &&
      Array.isArray(flagsArrayOrSecret)
    ) {
      return getPrecomputed(
        definition.key,
        flagsArrayOrSecret,
        requestOrCode,
        store.secret,
      );
    }

    // `request.headers` is a stable identity for the duration of the request,
    // so it doubles as the dedupe key for the shared evaluation cache and the
    // identify-args cache.
    const dedupeCacheKey = store.request.headers;
    const headers = sealHeaders(store.request.headers);
    const cookies = sealCookies(store.request.headers);

    const overrides = await readOverrides(cookies, store.secret);

    const entities = await getEntities(
      identify,
      dedupeCacheKey,
      headers,
      cookies,
    );
    const entitiesKey = JSON.stringify(entities) ?? '';

    return applyResult({
      definition: resolvedDefinition,
      readonlyHeaders: headers,
      entitiesKey,
      overrides,
      produce: () => decide({ headers, cookies, entities }),
    });
  };

  flagImpl.key = definition.key;
  flagImpl.defaultValue = definition.defaultValue;
  flagImpl.origin = origin;
  flagImpl.description = definition.description;
  flagImpl.options = normalizeOptions(definition.options);
  flagImpl.decide = decide;
  flagImpl.identify = identify;
  flagImpl.adapter = adapter;
  flagImpl.config = definition.config;

  // Internal markers read by `evaluate()` to partition flags into adapter
  // groups. See `../shared/evaluate.ts` for the symbol definitions.
  (flagImpl as any)[BULK_IDENTIFY_REF] =
    definition.identify ?? adapter?.identify ?? null;
  (flagImpl as any)[BULKABLE] =
    !definition.decide &&
    !!adapter?.bulkDecide &&
    adapter.adapterId !== undefined;

  return flagImpl;
}

export function getProviderData(flags: Record<string, Flag<any>>): ApiData {
  const definitions = Object.values(flags).reduce<FlagDefinitionsType>(
    (acc, d) => {
      acc[d.key] = {
        options: normalizeOptions(d.options),
        origin: d.origin,
        description: d.description,
        defaultValue: d.defaultValue,
        declaredInCode: true,
      };
      return acc;
    },
    {},
  );

  return { definitions, hints: [] };
}

interface AsyncLocalContext {
  request: Request;
  secret: string;
  params: Record<string, string>;
}

function createContext(
  request: Request,
  secret: string,
  params?: Record<string, string>,
): AsyncLocalContext {
  return {
    request,
    secret,
    params: params ?? {},
  };
}

const flagStorage = new AsyncLocalStorage<AsyncLocalContext>();

/**
 * Establishes context for flags, so they have access to the
 * request and cookie.
 *
 * Also registers evaluated flags, except for flags used only after `resolve` calls in other handlers.
 *
 * @example Usage example in src/hooks.server.ts
 *
 * ```ts
 * import { createHandle } from 'flags/sveltekit';
 * import * as flags from '$lib/flags';
 *
 * export const handle = createHandle({ flags });
 * ```
 *
 * @example Usage example in src/hooks.server.ts with other handlers
 *
 * Note that when composing `createHandle` with `sequence` then `createHandle` should come first. Only handlers after it will be able to access feature flags.
 */
export function createHandle({
  secret,
  flags,
}: {
  secret?: string;
  flags?: Record<string, Flag<any>>;
}): Handle {
  return async function handle({ event, resolve }) {
    secret ??= await tryGetSecret(secret);

    if (
      flags &&
      // avoid creating the URL object for every request by checking with includes() first
      event.request.url.includes('/.well-known/') &&
      new URL(event.request.url).pathname === '/.well-known/vercel/flags'
    ) {
      return handleWellKnownFlagsRoute(event, secret, flags);
    }

    const flagContext = createContext(
      event.request,
      secret,
      event.params as Record<string, string>,
    );
    return flagStorage.run(flagContext, () =>
      resolve(event, {
        transformPageChunk: async ({ html }) => {
          // Which flags were used while rendering this page lives in the shared
          // evaluation cache, keyed by the sealed request headers (the same key
          // `applyResult` writes under). `sealHeaders` is memoized by the raw
          // headers identity, so this returns the same sealed object.
          const usedFlags = getUsedFlags(sealHeaders(event.request.headers));
          if (Object.keys(usedFlags).length === 0) return html;

          // This is for reporting which flags were used when this page was generated,
          // so the value shows up in Vercel Toolbar, without the client ever being
          // aware of this feature flag.
          const encryptedFlagValues = await _encryptFlagValues(
            await resolveObjectPromises(usedFlags),
            secret,
          );

          return html.replace(
            '</body>',
            `<script type="application/json" data-flag-values>${safeJsonStringify(encryptedFlagValues)}</script></body>`,
          );
        },
      }),
    );
  };
}

async function handleWellKnownFlagsRoute(
  event: RequestEvent<Record<string, string>, string | null>,
  secret: string,
  flags: Record<string, Flag<any>>,
) {
  const access = await verifyAccess(
    event.request.headers.get('Authorization'),
    secret,
  );
  if (!access) return new Response(null, { status: 401 });
  const providerData = getProviderData(flags);
  return Response.json(providerData, {
    headers: { 'x-flags-sdk-version': version },
  });
}

export async function encryptFlagValues(
  value: FlagValuesType,
  secret?: string,
) {
  return _encryptFlagValues(value, await tryGetSecret(secret));
}

export async function decryptFlagValues(
  encryptedData: string,
  secret?: string,
) {
  return _decryptFlagValues(encryptedData, await tryGetSecret(secret));
}

export async function encryptOverrides(
  overrides: FlagOverridesType,
  secret?: string,
) {
  return _encryptOverrides(overrides, await tryGetSecret(secret));
}

export async function decryptOverrides(encryptedData: string, secret?: string) {
  return _decryptOverrides(encryptedData, await tryGetSecret(secret));
}

export async function encryptFlagDefinitions(
  value: FlagDefinitionsType,
  secret?: string,
) {
  return _encryptFlagDefinitions(value, await tryGetSecret(secret));
}

export async function decryptFlagDefinitions(
  encryptedData: string,
  secret?: string,
) {
  return _decryptFlagDefinitions(encryptedData, await tryGetSecret(secret));
}

/**
 * Evaluate a list of feature flags and generate a signed string representing their values.
 *
 * This convenience function call combines `evaluate` and `serialize`.
 *
 * @param flags - list of flags
 * @returns - a string representing evaluated flags
 */
export async function precompute<T extends FlagsArray>(
  flags: T,
  request: Request,
  secret?: string,
): Promise<string> {
  return _precompute(flags, request, await tryGetSecret(secret));
}

/**
 * Generates all permutations given a list of feature flags based on the options declared on each flag.
 * @param flags - The list of feature flags
 * @param filter - An optional filter function which gets called with each permutation.
 * @param secret - The secret sign the generated permutation with
 * @returns An array of strings representing each permutation
 */
export async function generatePermutations(
  flags: FlagsArray,
  filter: ((permutation: Record<string, JsonValue>) => boolean) | null = null,
  secret?: string,
): Promise<string[]> {
  return _generatePermutations(flags, filter, await tryGetSecret(secret));
}

/**
 * Creates a well-known flags endpoint for SvelteKit.
 * @param getApiData a function returning the API data
 * @param options accepts a secret
 * @returns a RequestHandler
 */
export function createFlagsDiscoveryEndpoint(
  getApiData: (event: RequestEvent) => Promise<ApiData> | ApiData,
  options?: {
    secret?: string | undefined;
  },
) {
  const requestHandler: RequestHandler = async (event) => {
    return handleDiscoveryRequest({
      authHeader: event.request.headers.get('Authorization'),
      secret: options?.secret,
      getApiData: () => getApiData(event),
      unauthorized: () => error(401),
      respond: (apiData, headers) => json(apiData, { headers }),
    });
  };

  return requestHandler;
}
