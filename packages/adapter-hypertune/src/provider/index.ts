import type { ProviderData } from 'flags';

export async function getProviderData(options: {
  token: string;
}): Promise<ProviderData> {
  if (!options.token) {
    return {
      definitions: {},
      hints: [
        { key: 'hypertune/missing-token', text: 'Missing Hypertune token' },
      ],
    };
  }

  const response = await fetch(
    `https://edge.hypertune.com/vercel-flag-definitions`,
    {
      headers: { Authorization: `Bearer ${options.token}` },
      // @ts-expect-error used by some Next.js versions
      cache: 'no-store',
    },
  );

  if (response.status !== 200) {
    return {
      definitions: {},
      hints: [
        {
          key: 'hypertune/response-not-ok',
          text: `Failed to fetch Hypertune flag definitions (received ${response.status} response)`,
        },
      ],
    };
  }

  const definitions = (await response.json()) as ProviderData['definitions'];
  return { definitions, hints: [] };
}
