import type { ProviderData } from '../types';

/**
 * Keys that must never appear as property keys to prevent
 * prototype pollution when merging provider data.
 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export async function mergeProviderData(
  itemsPromises: (Promise<ProviderData> | ProviderData)[],
): Promise<ProviderData> {
  const items = await Promise.all(
    itemsPromises.map((p) => Promise.resolve(p).catch(() => null)),
  );

  return items
    .filter((item): item is ProviderData => Boolean(item))
    .reduce<ProviderData>(
      (acc, item) => {
        Object.entries(item.definitions).forEach(([key, definition]) => {
          // Prevent prototype pollution via crafted definition keys
          if (FORBIDDEN_KEYS.has(key)) return;
          if (!acc.definitions[key]) acc.definitions[key] = {};
          // Use safe property-by-property copy instead of Object.assign
          // to prevent __proto__ keys inside definition from polluting prototypes
          for (const [prop, value] of Object.entries(definition)) {
            if (!FORBIDDEN_KEYS.has(prop)) {
              (acc.definitions[key] as Record<string, unknown>)[prop] = value;
            }
          }
        });

        if (Array.isArray(item.hints)) acc.hints.push(...item.hints);

        return acc;
      },
      { definitions: {}, hints: [] },
    );
}
