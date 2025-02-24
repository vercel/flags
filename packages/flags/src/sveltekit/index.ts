import type { Handle, RequestEvent } from '@sveltejs/kit';
import { AsyncLocalStorage } from 'node:async_hooks';
// @ts-expect-error will be available in user's project
import { env } from '$env/dynamic/private';
import {
  type ApiData,
  decrypt as _decrypt,
  encrypt as _encrypt,
  reportValue,
  safeJsonStringify,
  verifyAccess,
  type JsonValue,
  type FlagDefinitionsType,
} from '..';
import { Decide, FlagDeclaration, Identify } from '../types';
import {
  type ReadonlyHeaders,
  HeadersAdapter,
} from '../spec-extension/adapters/headers';
import {
  type ReadonlyRequestCookies,
  RequestCookiesAdapter,
} from '../spec-extension/adapters/request-cookies';
import { normalizeOptions } from '../lib/normalize-options';
import { RequestCookies } from '@edge-runtime/cookies';
import { Flag } from './types';
import { generatePermutations, getPrecomputed, precompute } from './precompute';

function hasOwnProperty<X extends {}, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return obj.hasOwnProperty(prop);
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
    throw new Error(`flags: No decide function provided for ${definition.key}`);
  };
}

function getIdentify<ValueType, EntitiesType>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
): Identify<EntitiesType> | undefined {
  if (typeof definition.identify === 'function') {
    return definition.identify;
  }
  if (typeof definition.adapter?.identify === 'function') {
    return definition.adapter.identify;
  }
}

function tryGetSecret(secret?: string): string {
  if (!secret) {
    secret = env.FLAGS_SECRET;
  }
  if (!secret) {
    throw new Error('flags: No secret provided');
  }
  return secret;
}

/**
 * Used when a flag is called outside of a request context, i.e. outside of the lifecycle of the `handle` hook.
 * This could be the case when the flag is called from edge middleware.
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

  const flagImpl = async function flagImpl(
    request?: Request,
    secret?: string,
  ): Promise<ValueType> {
    let store = flagStorage.getStore();

    if (!store) {
      if (request) {
        store = requestMap.get(request);
        if (!store) {
          store = createContext(request, secret ?? tryGetSecret());
          requestMap.set(request, store);
        }
      } else {
        throw new Error('flags: Neither context found nor Request provided');
      }
    }

    if (hasOwnProperty(store.usedFlags, definition.key)) {
      const valuePromise = store.usedFlags[definition.key];
      if (typeof valuePromise !== 'undefined') {
        return valuePromise as Promise<ValueType>;
      }
    }

    const headers = sealHeaders(store.request.headers);
    const cookies = sealCookies(store.request.headers);

    const overridesCookie = cookies.get('vercel-flag-overrides')?.value;
    const overrides = overridesCookie
      ? await decrypt<Record<string, ValueType>>(overridesCookie, store.secret)
      : undefined;

    if (overrides && hasOwnProperty(overrides, definition.key)) {
      const value = overrides[definition.key];
      if (typeof value !== 'undefined') {
        reportValue(definition.key, value);
        store.usedFlags[definition.key] = Promise.resolve(value as JsonValue);
        return value;
      }
    }

    let entities: EntitiesType | undefined;
    if (identify) {
      // Deduplicate calls to identify, key being the function itself
      if (!store.identifiers.has(identify)) {
        const entities = identify({
          headers,
          cookies,
        });
        store.identifiers.set(identify, entities);
      }

      entities = (await store.identifiers.get(identify)) as EntitiesType;
    }

    const valuePromise = decide({
      headers,
      cookies,
      entities,
    });
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

  return flagImpl;
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
  secret = tryGetSecret(secret);

  return function handle({ event, resolve }) {
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
          const encryptedFlagValues = await encrypt(
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
  event: RequestEvent<Partial<Record<string, string>>, string | null>,
  secret: string,
  flags: Record<string, Flag<any>>,
) {
  const access = await verifyAccess(
    event.request.headers.get('Authorization'),
    secret,
  );
  if (!access) return new Response(null, { status: 401 });
  return Response.json(getProviderData(flags));
}

/**
 * Function to encrypt overrides, values, definitions, and API data.
 *
 * Convenience wrapper around `encrypt` from `@vercel/flags` for not
 * having to provide a secret - it will be read from the environment
 * variable `FLAGS_SECRET` via `$env/dynamic/private` if not provided.
 */
export async function encrypt<T extends object>(
  value: T,
  secret?: string,
): Promise<string> {
  return _encrypt(value, tryGetSecret(secret));
}

/**
 * Function to decrypt overrides, values, definitions, and API data.
 *
 * Convenience wrapper around `deencrypt` from `@vercel/flags` for not
 * having to provide a secret - it will be read from the environment
 * variable `FLAGS_SECRET` via `$env/dynamic/private` if not provided.
 */
export async function decrypt<T extends object>(
  encryptedData: string,
  secret?: string,
): Promise<T | undefined> {
  return _decrypt(encryptedData, tryGetSecret(secret));
}

/**
 * Create an object for managing precomputed flags that are used for a certain route parameter.
 * Use this only if you want to prerender or ISR the pages.
 *
 * 1. Generate the precomputed flags object. The first parameter is the name of the route parameter, the second is an object with flags that should be precomputed/decoded:
 *
 * ```ts
 * const marketing = createPrecomputedFlags('code', { flag1, flag2 });
 * ```
 *
 * 2. If you want to prerender the pages, use `generatePermutations` inside `entries` to generate all possible permutations (if you use ISR you can skip this step):
 *
 * ```ts
 * // file: src/routes/marketing/[code]/+page.server.ts
 * export const prerender = true;
 *
 * export function entries() {
 *  return marketing.generatePermutations().map((code) => ({ code }));
 * }
 * ```
 *
 * 3. At runtime, generate the code within edge middleware:
 *
 * ```ts
 * // file: src/edge-middleware.ts
 * export default async function middleware(request: Request) {
 *  if (new URL(request.url).pathname === '/marketing')) {
 *    const code = await marketing.precompute(request);
 *    return rewrite(`/marketing/${code}`);
 *  }
 * }
 * ```
 *
 * 4. Use them in your SvelteKit load function:
 *
 * ```ts
 * // file: src/routes/marketing/[code]/+page.server.ts
 * export function load() {
 *  const value = marketing.flags.flag1();
 *  // ...
 * }
 * ```
 */
export function createPrecomputedFlags<T extends Record<string, Flag<any>>>(
  param: string,
  flags: T,
  secret: string = tryGetSecret(),
) {
  const flagFunctions = Object.entries(flags).map(([_, flag]) => flag);
  const flagsArray = Object.entries(flags).map(([key, flag]) => {
    const fn = async () => {
      let store = flagStorage.getStore();

      if (!store) {
        throw new Error(
          'flags: No context found. You need to run this function during the lifecycle of the `handle` hook.',
        );
      }

      const code = store.params[param];

      if (!code) {
        throw new Error(
          `flags: Parameter '${param}' not found in context. Make sure you call this flag inside the right route.`,
        );
      }

      return getPrecomputed(flag, flagFunctions, code, store.secret);
    };

    return [key, fn];
  });

  return {
    generatePermutations: (
      filter:
        | ((permutation: Record<string, JsonValue>) => boolean)
        | null = null,
    ) => {
      return generatePermutations(flagFunctions, filter, secret);
    },
    precompute: async (request: Request) => {
      return precompute(flagFunctions, request, secret);
    },
    flags: Object.fromEntries(flagsArray) as {
      [K in keyof T]: () => ReturnType<T[K]>;
    },
  };
}
