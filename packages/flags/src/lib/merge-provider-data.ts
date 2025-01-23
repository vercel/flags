import { ProviderData } from '../types';

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
          if (!acc.definitions[key]) acc.definitions[key] = {};
          Object.assign(acc.definitions[key], definition);
        });

        if (Array.isArray(item.hints)) acc.hints.push(...item.hints);

        return acc;
      },
      { definitions: {}, hints: [] },
    );
}
