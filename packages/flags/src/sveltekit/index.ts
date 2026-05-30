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
import {
  attachFlagMetadata,
  getDecide,
  getIdentify,
  getOrigin,
  resolveFlag,
  sealCookies,
  sealHeaders,
} from '../engine';
import type { RequestContext } from '../engine/types';
import { normalizeOptions } from '../lib/normalize-options';
import type {
  FlagDeclaration,
  FlagOverridesType,
  FlagValuesType,
  Identify,
} from '../types';
import { tryGetSecret } from './env';
import {
  generatePermutations as _generatePermutations,
  precompute as _precompute,
  getPrecomputed,
} from './precompute';
import type { Flag, FlagsArray } from './types';

type PromisesMap<T> = {
  [K in keyof T]: Promise<T[K]>;
};

async function resolveObjectPromises<T>(obj: PromisesMap<T>): Promise<T> {
  const entries = Object.entries(obj) as [keyof T, Promise<any>][];
  const resolvedEntries = await Promise.all(
    entries.map(async ([key, promise]) => {
      const value = await promise;
      return [key, value] as [keyof T, T[keyof T]];
    }),
  );
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
  const decide = getDecide<ValueType, EntitiesType>(definition);
  const identify = getIdentify(definition);
  const origin = getOrigin(definition);

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

    // Precomputed path
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

    const context: RequestContext = {
      headers: sealHeaders(store.request.headers),
      cookies: sealCookies(store.request.headers),
      cacheKey: store.request.headers,
    };

    const value = await resolveFlag<ValueType, EntitiesType>(context, {
      key: definition.key,
      defaultValue: definition.defaultValue,
      config: definition.config,
      decide,
      identify,
      decryptOverrides: (cookie: string) =>
        _decryptOverrides(cookie, store!.secret),
    });

    // Track used flags for HTML injection in createHandle
    store.usedFlags[definition.key] = Promise.resolve(value as JsonValue);

    return value;
  };

  attachFlagMetadata(flagImpl, definition, { decide, identify, origin });

  return flagImpl as Flag<ValueType>;
}

export function getProviderData(flags: Record<string, Flag<any>>): ApiData {
  const definitions = Object.values(flags).reduce<FlagDefinitionsType>(
    (acc, d) => {
      acc[d.key] = {
        options: normalizeOptions(d.options),
        origin: d.origin,
        description: d.description,
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
  usedFlags: Record<string, Promise<JsonValue>>;
  identifiers: Map<Identify<unknown>, ReturnType<Identify<unknown>>>;
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
    usedFlags: {},
    identifiers: new Map(),
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
          const store = flagStorage.getStore();
          if (!store || Object.keys(store.usedFlags).length === 0) return html;

          // This is for reporting which flags were used when this page was generated,
          // so the value shows up in Vercel Toolbar, without the client ever being
          // aware of this feature flag.
          const encryptedFlagValues = await _encryptFlagValues(
            await resolveObjectPromises(store.usedFlags),
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
    const access = await verifyAccess(
      event.request.headers.get('Authorization'),
      options?.secret,
    );
    if (!access) error(401);

    const apiData = await getApiData(event);
    return json(apiData, { headers: { 'x-flags-sdk-version': version } });
  };

  return requestHandler;
}
