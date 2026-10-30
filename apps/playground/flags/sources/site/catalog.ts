import type { DatafileInput } from '@vercel/flags-core';
import { getVercelOidcToken } from '@vercel/oidc';
import type { Catalog } from 'flags';
import { getDemoDescription } from '../../demo-descriptions.ts';

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
    id: `${datafile.projectId}/${datafile.environment}`,
    revision: datafile.revision,
    flags,
  };
}

export default async function loadCatalog(): Promise<Catalog> {
  const token = await getVercelOidcToken();
  const response = await fetch('https://flags.vercel.com/v1/datafile', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(
      `Flags catalog request failed (${response.status}). Run vercel env pull .env.local in apps/playground, then retry.`,
    );
  }
  return catalogFromDatafile(await response.json());
}
