import type { DatafileInput } from '@vercel/flags-core';
import type { Catalog, CatalogLoadOptions } from 'flags';
import { getDemoDescription } from '../../../utils/demo-descriptions.ts';
import { streamDatafiles } from './stream.ts';

export function catalogFromDatafile(datafile: DatafileInput): Catalog {
  if (!datafile.projectId || !datafile.environment || !datafile.definitions) {
    throw new Error('The provider returned an invalid flags datafile.');
  }

  const flags = Object.fromEntries(
    Object.entries(datafile.definitions).map(([key, definition]) => {
      if (!Array.isArray(definition.variants) || !definition.variants.length) {
        throw new Error(`Flag ${JSON.stringify(key)} has no variants.`);
      }
      return [
        key,
        {
          variants: definition.variants,
          description: getDemoDescription(key),
        },
      ];
    }),
  );

  return {
    // For the links of Flags Explorer
    project: { system: 'vercel-flags', projectId: datafile.projectId },
    revision: datafile.revision,
    flags,
  };
}

export default async function* loadCatalog({
  signal,
}: CatalogLoadOptions): AsyncGenerator<Catalog> {
  for await (const datafile of streamDatafiles({ signal })) {
    yield catalogFromDatafile(datafile);
  }
}
