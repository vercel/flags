import type { Handle, RequestEvent } from '@sveltejs/kit';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  type ApiData,
  encrypt,
  safeJsonStringify,
  verifyAccess,
  type JsonValue,
  type FlagDefinitionsType,
} from '..';
import { FlagDeclaration, GenerousOption } from '../types';
import { normalizeOptions } from '../lib/normalize-options';
import { core, getDecide, getIdentify } from '../lib/core';
import { getOrigin } from '../lib/origin';
import { sealCookies, sealHeaders } from '../lib/request-mapping';
import { resolveObjectPromises } from '../lib/resolve-object-promises';

type Flag<ReturnValue> = (() => ReturnValue | Promise<ReturnValue>) & {
  key: string;
  description?: string;
  origin?: string | Record<string, unknown>;
  options?: GenerousOption<ReturnValue>[];
};

/**
 * Declares a feature flag
 */
export function flag<
  ValueType extends JsonValue = boolean | string | number,
  EntitiesType = any,
>(definition: FlagDeclaration<ValueType, EntitiesType>): Flag<ValueType> {
  const decide = getDecide<ValueType, EntitiesType>(definition);
  const identify = getIdentify<ValueType, EntitiesType>(definition);
  const origin = getOrigin(definition);

  const flagImpl = async function flagImpl(): Promise<ValueType> {
    const store = flagStorage.getStore();

    if (!store) {
      throw new Error('flags: context not found');
    }

    const readonlyHeaders = sealHeaders(store.event.request.headers);
    const readonlyCookies = sealCookies(store.event.request.headers);

    const decisionPromise = core<ValueType, EntitiesType>({
      readonlyHeaders,
      readonlyCookies,
      flagKey: definition.key,
      identify,
      decide,
      requestCacheKey: store.event.request,
      defaultValue: definition.defaultValue,
      shouldReportValue: definition.config?.reportValue !== false,
      secret: store.secret,
    });

    // report for handler
    store.usedFlags[definition.key] = decisionPromise as Promise<JsonValue>;

    return decisionPromise;
  };

  flagImpl.key = definition.key;
  flagImpl.defaultValue = definition.defaultValue;
  flagImpl.origin = definition.origin;
  flagImpl.description = definition.description;
  flagImpl.options = definition.options;
  flagImpl.decide = decide;
  flagImpl.origin = origin;
  flagImpl.identify = identify;

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
