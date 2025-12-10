/// <reference types="nuxt/app" />

import type { H3Event } from 'h3';
import { getHeaders } from 'h3';
import type { FlagStore } from '#flags-implementation';
import { getEvent, getState, getStore } from '#flags-implementation';
import { decryptOverrides } from '../../lib/crypto';
import { normalizeOptions } from '../../lib/normalize-options';
import { reportValue } from '../../lib/report-value';
import { getPrecomputed } from '../../precompute';
import {
  getDecide,
  getIdentify,
  // biome-ignore lint/suspicious/noShadowRestrictedNames: for type safety
  hasOwnProperty,
  sealCookies,
  sealHeaders,
} from '../../shared';
import type { FlagDeclaration, JsonValue } from '../../types';
import type { Flag, FlagsArray } from '../types';

export function defineFlag<
  ValueType extends JsonValue = boolean | string | number,
  EntitiesType = any,
>(definition: FlagDeclaration<ValueType, EntitiesType>): Flag<ValueType>;
export function defineFlag<
  ValueType extends JsonValue = boolean | string | number,
  EntitiesType = any,
>(
  definition: FlagDeclaration<ValueType, EntitiesType>,
  _key?: string,
): Flag<ValueType> {
  const key = typeof _key === 'string' ? _key : definition.key;
  async function flagImpl(event = getEvent()): Promise<ValueType> {
    // get precomputed hash + flags array from context
    const { hash, flags } = event?.context.precomputedFlags || {};
    const state = getState<ValueType>(key, event as H3Event);
    if (typeof hash === 'string' && Array.isArray(flags)) {
      if (import.meta.client) {
        throw new Error(
          'flags: Precomputed flags can only be evaluated on the server. ' +
            'Call them in a server context (e.g., in a page script with SSR) and pass the values to the client.',
        );
      }
      const store = getStore<FlagStore>();
      state.value = await getPrecomputed<ValueType>(
        key,
        flags,
        hash,
        store.secret,
      );
      return state.value;
    }

    if (import.meta.client) {
      // If we have a cached value from SSR, return it
      return state.value;
    }

    const store = getStore<FlagStore>(event);

    if (hasOwnProperty(store.usedFlags, definition.key)) {
      const valuePromise = store.usedFlags[definition.key];
      if (typeof valuePromise !== 'undefined') {
        return valuePromise as Promise<ValueType>;
      }
    }

    const headersInit = Object.entries(getHeaders(store.event)) as [
      string,
      string,
    ][];
    const webHeaders = new Headers(headersInit);
    const headers = sealHeaders(webHeaders);
    const cookies = sealCookies(webHeaders);

    const overridesCookie = cookies.get('vercel-flag-overrides')?.value;
    const overrides = overridesCookie
      ? await decryptOverrides(overridesCookie, store.secret)
      : undefined;

    if (overrides && hasOwnProperty(overrides, definition.key)) {
      const value = overrides[definition.key];
      if (typeof value !== 'undefined') {
        reportValue(definition.key, value);
        store.usedFlags[definition.key] = Promise.resolve(value as JsonValue);
        state.value = value;
        return value;
      }
    }

    let entities: EntitiesType | undefined;
    const identify = flagImpl.identify;
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

    const valuePromise = flagImpl.decide({
      headers,
      cookies,
      entities,
    });
    store.usedFlags[definition.key] = valuePromise as Promise<JsonValue>;

    const value = await valuePromise;
    reportValue(definition.key, value);

    // forward value to client
    state.value = value;
    return value;
  }

  flagImpl.key = key;
  if (import.meta.client) {
    return flagImpl;
  }

  flagImpl.defaultValue = definition.defaultValue;
  flagImpl.origin = definition.origin;
  flagImpl.description = definition.description;
  flagImpl.options = normalizeOptions(definition.options);
  flagImpl.decide = getDecide<ValueType, EntitiesType>(definition);
  flagImpl.identify = getIdentify(definition);
  // track original key for toolbar integration
  flagImpl._key = definition.key;

  return flagImpl;
}

// Re-export precompute utilities
export { handlePrecomputedPaths, prerenderMiddleware } from './precompute';

declare module 'h3' {
  interface H3EventContext {
    flags?: FlagStore;
    precomputedFlags?: {
      hash?: string;
      flags?: FlagsArray;
    };
  }
}
