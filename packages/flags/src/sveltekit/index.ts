import type { Handle, RequestEvent } from '@sveltejs/kit';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  type ApiData,
  decrypt,
  encrypt,
  reportValue,
  safeJsonStringify,
  verifyAccess,
  type JsonValue,
  type FlagDefinitionsType,
} from '..';
import { Decide, FlagDeclaration, GenerousOption } from '../types';
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

type Flag<ReturnValue> = (() => ReturnValue | Promise<ReturnValue>) & {
  key: string;
  description?: string;
  origin?: string | Record<string, unknown>;
  options?: GenerousOption<ReturnValue>[];
};

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

/**
 * Declares a feature flag
 */
export function flag<T>(definition: FlagDeclaration<T, unknown>): Flag<T> {
  const decide = getDecide<T, unknown>(definition);

  const flagImpl = async function flagImpl(): Promise<T> {
    const store = flagStorage.getStore();

    if (!store) {
      throw new Error('flags: context not found');
    }

    if (hasOwnProperty(store.usedFlags, definition.key)) {
      const valuePromise = store.usedFlags[definition.key];
      if (typeof valuePromise !== 'undefined') {
        return valuePromise as Promise<T>;
      }
    }

    const overridesCookie = store.event.cookies.get('vercel-flag-overrides');
    const overrides = overridesCookie
      ? await decrypt<Record<string, T>>(overridesCookie, store.secret)
      : undefined;

    if (overrides && hasOwnProperty(overrides, definition.key)) {
      const value = overrides[definition.key];
      if (typeof value !== 'undefined') {
        reportValue(definition.key, value);
        store.usedFlags[definition.key] = Promise.resolve(value as JsonValue);
        return value;
      }
    }

    const valuePromise = decide(
      {
        headers: sealHeaders(store.event.request.headers),
        cookies: sealCookies(store.event.request.headers),
      },
      // @ts-expect-error not part of the type, but we supply it for convenience
      { event: store.event },
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
  flagImpl.options = definition.options;
  flagImpl.decide = decide;
  // flagImpl.identify = definition.identify;

  return flagImpl;
}

export function getProviderData(
  flags: Record<string, Flag<JsonValue>>,
): ApiData {
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
  event: RequestEvent<Partial<Record<string, string>>, string | null>;
  secret: string;
  usedFlags: Record<string, Promise<JsonValue>>;
}

function createContext(
  event: RequestEvent<Partial<Record<string, string>>, string | null>,
  secret: string,
): AsyncLocalContext {
  return {
    event,
    secret,
    usedFlags: {},
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
 * import { FLAGS_SECRET } from '$env/static/private';
 * import * as flags from '$lib/flags';
 *
 * export const handle = createHandle({ secret: FLAGS_SECRET, flags });
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
  secret: string;
  flags?: Record<string, Flag<JsonValue>>;
}): Handle {
  return function handle({ event, resolve }) {
    if (
      flags &&
      // avoid creating the URL object for every request by checking with includes() first
      event.request.url.includes('/.well-known/') &&
      new URL(event.request.url).pathname === '/.well-known/vercel/flags'
    ) {
      return handleWellKnownFlagsRoute(event, secret, flags);
    }

    const flagContext = createContext(event, secret);
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
  flags: Record<string, Flag<JsonValue>>,
) {
  const access = await verifyAccess(
    event.request.headers.get('Authorization'),
    secret,
  );
  if (!access) return new Response(null, { status: 401 });
  return Response.json(getProviderData(flags));
}
