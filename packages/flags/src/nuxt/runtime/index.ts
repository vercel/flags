/// <reference types="nuxt/app" />

import { Flag } from '../types';
import { FlagDeclaration, JsonValue } from '../../types';
import { normalizeOptions } from '../../lib/normalize-options';
import { decryptOverrides } from '../../lib/crypto';
import { reportValue } from '../../lib/report-value';
import {
  getDecide,
  getIdentify,
  hasOwnProperty,
  sealCookies,
  sealHeaders,
} from '../../shared';

import type { H3Event } from 'h3';
import { getState, getStore } from '#flags-implementation';
import type { FlagStore } from '#flags-implementation';

// TODO: add precomputed support
export function defineFlag<
  ValueType extends JsonValue = boolean | string | number,
  EntitiesType = any,
>(definition: FlagDeclaration<ValueType, EntitiesType>): Flag<ValueType> {
  const decide = getDecide<ValueType, EntitiesType>(definition);
  const identify = getIdentify(definition);

  async function flagImpl(event?: H3Event): Promise<ValueType> {
    const state = getState<ValueType>(definition.key, event);

    if (import.meta.client) {
      return state.value;
    }

    const store = getStore<FlagStore>(event);

    if (hasOwnProperty(store.usedFlags, definition.key)) {
      const valuePromise = store.usedFlags[definition.key];
      if (typeof valuePromise !== 'undefined') {
        return valuePromise as Promise<ValueType>;
      }
    }

    const headers = sealHeaders(store.event.headers);
    const cookies = sealCookies(store.event.headers);

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

    // forward value to client
    state.value = value;
    return value;
  }

  flagImpl.key = definition.key;
  flagImpl.defaultValue = definition.defaultValue;
  flagImpl.origin = definition.origin;
  flagImpl.description = definition.description;
  flagImpl.options = normalizeOptions(definition.options);
  flagImpl.decide = decide;
  flagImpl.identify = identify;

  return flagImpl;
}
