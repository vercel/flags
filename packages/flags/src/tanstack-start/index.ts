import { RequestCookies } from '@edge-runtime/cookies';
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
  reportValue,
  verifyAccess,
  version,
} from '..';
import { normalizeOptions } from '../lib/normalize-options';
import {
  HeadersAdapter,
  type ReadonlyHeaders,
} from '../spec-extension/adapters/headers';
import {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from '../spec-extension/adapters/request-cookies';
import type {
  Decide,
  FlagDeclaration,
  FlagOverridesType,
  FlagValuesType,
  Identify,
  ResolvedFlagDeclaration,
} from '../types';
import { tryGetSecret } from './env';
import { getStartRequest } from './get-request';
import {
  generatePermutations as _generatePermutations,
  precompute as _precompute,
  getPrecomputed,
} from './precompute';
import type { Flag, FlagsArray } from './types';

export type { Flag, FlagsArray } from './types';

// biome-ignore lint/suspicious/noShadowRestrictedNames: for type safety
function hasOwnProperty<X extends {}, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return Object.hasOwn(obj, prop);
}

const headersMap = new WeakMap<Headers, ReadonlyHeaders>();
const cookiesMap = new WeakMap<Headers, ReadonlyRequestCookies>();

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

function getDecide<ValueType, EntitiesType>(
  definition: ResolvedFlagDeclaration<ValueType, EntitiesType>,
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

function getIdentify<ValueType, EntitiesType>(
  definition: ResolvedFlagDeclaration<ValueType, EntitiesType>,
): Identify<EntitiesType> | undefined {
  if (typeof definition.identify === 'function') {
    return definition.identify;
  }
  if (typeof definition.adapter?.identify === 'function') {
    return definition.adapter.identify;
  }
}

interface RequestContext {
  /**
   * A secret passed explicitly to the flag, if any. The secret is only needed
   * to decrypt Vercel Toolbar overrides, so it is resolved lazily (see the
   * override branch in `flagImpl`) rather than required up front.
   */
  secretOverride?: string;
  usedFlags: Record<string, Promise<JsonValue>>;
  identifiers: Map<Identify<unknown>, ReturnType<Identify<unknown>>>;
}

/**
 * Per-request context, keyed off the request instance returned by TanStack
 * Start's `getRequest()` (or the request passed explicitly to a flag). This
 * deduplicates `decide`/`identify` calls and override decryption within a
 * single request.
 */
const contextMap = new WeakMap<Request, RequestContext>();

// Resolving the context must stay synchronous so that, for a request passed
// explicitly, concurrent flag evaluations share a single `decide` call (the
// `usedFlags` entry is written before the first `await`).
//
// The secret is NOT required here: a plain `decide` flag (no overrides cookie,
// no precompute) must evaluate without FLAGS_SECRET. The secret is resolved
// lazily, and only when an overrides cookie is actually present.
function getContext(request: Request, secret?: string): RequestContext {
  const existing = contextMap.get(request);
  if (existing) {
    // Capture an explicitly-passed secret if an earlier call didn't have one.
    if (secret && !existing.secretOverride) existing.secretOverride = secret;
    return existing;
  }

  const context: RequestContext = {
    secretOverride: secret,
    usedFlags: {},
    identifiers: new Map(),
  };
  contextMap.set(request, context);
  return context;
}

/**
 * Declares a feature flag.
 *
 * The returned function can be called with no arguments inside a route loader,
 * server function, or server route — the request is resolved automatically
 * through TanStack Start's `getRequest()`. You may also pass a `Request`
 * explicitly when evaluating outside of a request context.
 *
 * If an override set by Vercel Toolbar is present (the `vercel-flag-overrides`
 * cookie) then the `decide` function will not be called and the value of the
 * override will be returned instead.
 *
 * @example
 * ```ts
 * import { flag } from 'flags/tanstack-start';
 *
 * export const showBanner = flag<boolean>({
 *   key: 'show-banner',
 *   decide: () => false,
 * });
 *
 * // inside a route loader / server function
 * const value = await showBanner();
 * ```
 */
export function flag<
  ValueType extends JsonValue = boolean | string | number,
  EntitiesType = any,
>(definition: FlagDeclaration<ValueType, EntitiesType>): Flag<ValueType> {
  // Allow passing the adapter factory directly (`adapter: vercelAdapter`) as a
  // shorthand for calling it (`adapter: vercelAdapter()`). Resolve it once here.
  const adapter =
    typeof definition.adapter === 'function'
      ? definition.adapter()
      : definition.adapter;
  const resolvedDefinition = {
    ...definition,
    adapter,
  } as ResolvedFlagDeclaration<ValueType, EntitiesType>;

  const decide = getDecide<ValueType, EntitiesType>(resolvedDefinition);
  const identify = getIdentify(resolvedDefinition);

  const flagImpl = async function flagImpl(
    requestOrCode?: string | Request,
    flagsArrayOrSecret?: string | Flag<any>[],
    maybeSecret?: string,
  ): Promise<ValueType> {
    // Precomputed mode: `flag(code, flagsArray, secret?)`
    if (
      typeof requestOrCode === 'string' &&
      Array.isArray(flagsArrayOrSecret)
    ) {
      return getPrecomputed(
        definition.key,
        flagsArrayOrSecret,
        requestOrCode,
        await tryGetSecret(maybeSecret),
      );
    }

    const request =
      requestOrCode instanceof Request
        ? requestOrCode
        : await getStartRequest();

    const secret =
      typeof flagsArrayOrSecret === 'string' ? flagsArrayOrSecret : undefined;

    const store = getContext(request, secret);

    if (hasOwnProperty(store.usedFlags, definition.key)) {
      const valuePromise = store.usedFlags[definition.key];
      if (typeof valuePromise !== 'undefined') {
        return valuePromise as Promise<ValueType>;
      }
    }

    const headers = sealHeaders(request.headers);
    const cookies = sealCookies(request.headers);

    const overridesCookie = cookies.get('vercel-flag-overrides')?.value;
    if (overridesCookie) {
      // The secret is only needed to decrypt overrides — resolve it here.
      const secret = store.secretOverride ?? process.env.FLAGS_SECRET;
      if (!secret) {
        throw new Error(
          'flags: No secret provided. Set an environment variable FLAGS_SECRET or provide a secret to the function.',
        );
      }
      const overrides = await _decryptOverrides(overridesCookie, secret);
      if (overrides && hasOwnProperty(overrides, definition.key)) {
        const value = overrides[definition.key];
        if (typeof value !== 'undefined') {
          reportValue(definition.key, value);
          store.usedFlags[definition.key] = Promise.resolve(value as JsonValue);
          return value as ValueType;
        }
      }
    }

    let entities: EntitiesType | undefined;
    if (identify) {
      // Deduplicate calls to identify, key being the function itself
      if (!store.identifiers.has(identify)) {
        const entitiesPromise = identify({
          headers,
          cookies,
        });
        store.identifiers.set(identify, entitiesPromise);
      }

      entities = (await store.identifiers.get(identify)) as EntitiesType;
    }

    // Fall back to the declared `defaultValue` when `decide` (or the adapter)
    // returns `undefined`. The wrapped promise is stored synchronously so
    // concurrent evaluations dedupe to the same (defaulted) value.
    const valuePromise = Promise.resolve(
      decide({ headers, cookies, entities }),
    ).then((decided) =>
      decided === undefined ? (definition.defaultValue as ValueType) : decided,
    );
    store.usedFlags[definition.key] = valuePromise as Promise<JsonValue>;

    const value = await valuePromise;
    reportValue(definition.key, value);
    return value;
  };

  flagImpl.key = definition.key;
  flagImpl.defaultValue = definition.defaultValue;
  flagImpl.origin = definition.origin;
  flagImpl.description = definition.description;
  flagImpl.options = normalizeOptions(definition.options);
  flagImpl.decide = decide;
  flagImpl.identify = identify;

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
 * The handler context provided by a TanStack Start server route handler.
 * Typed loosely so this package doesn't need to depend on TanStack types.
 */
interface ServerRouteHandlerContext {
  request: Request;
}

/**
 * Creates a handler for the `/.well-known/vercel/flags` discovery endpoint.
 *
 * Wire it up in a server route, e.g. `src/routes/.well-known/vercel/flags.ts`:
 *
 * @example
 * ```ts
 * import { createFileRoute } from '@tanstack/react-router';
 * import { createFlagsDiscoveryEndpoint, getProviderData } from 'flags/tanstack-start';
 * import * as flags from '../../flags';
 *
 * const handler = createFlagsDiscoveryEndpoint(() => getProviderData(flags));
 *
 * export const Route = createFileRoute('/.well-known/vercel/flags/')({
 *   server: { handlers: { GET: handler } },
 * });
 * ```
 *
 * @param getApiData a function returning the API data
 * @param options accepts a secret
 * @returns a server route handler returning a `Response`
 */
export function createFlagsDiscoveryEndpoint(
  getApiData: (
    context: ServerRouteHandlerContext,
  ) => Promise<ApiData> | ApiData,
  options?: {
    secret?: string | undefined;
  },
) {
  return async function handler(
    context: ServerRouteHandlerContext,
  ): Promise<Response> {
    const access = await verifyAccess(
      context.request.headers.get('Authorization'),
      options?.secret,
    );
    if (!access) return new Response(null, { status: 401 });

    const apiData = await getApiData(context);
    return Response.json(apiData, {
      headers: { 'x-flags-sdk-version': version },
    });
  };
}
