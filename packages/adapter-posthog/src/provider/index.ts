import type { FlagDefinitionsType, ProviderData } from 'flags';

// See: https://posthog.com/docs/api/feature-flags#get-api-projects-project_id-feature_flags
interface ApiData {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: {
    id: number;
    key: string;
    name: string;
    created_at: string;
    description: string;
    deleted: boolean;
    active: boolean;
    is_simple_flag: boolean;
    filters: {
      payloads?: Record<string, string>;
      multivariate?: Record<string, unknown>;
    };
  }[];
}

export async function getProviderData(options: {
  personalApiKey: string;
  projectId: string;
  appHost?: string;
}): Promise<ProviderData> {
  const hints: Exclude<ProviderData['hints'], undefined> = [];

  if (!options.personalApiKey) {
    hints.push({
      key: 'posthog/missing-personal-api-key',
      text: 'Missing PostHog Personal API Key',
    });
  }

  let host = options.appHost;
  if (!host) {
    try {
      host = getAppHost();
    } catch (e) {
      hints.push({
        key: 'posthog/missing-app-host',
        text: 'Missing NEXT_PUBLIC_POSTHOG_HOST environment variable',
      });
    }
  }

  if (!options.projectId) {
    hints.push({
      key: 'posthog/missing-project-id',
      text: 'Missing PostHog Project ID',
    });
  }

  if (hints.length > 0) {
    return { definitions: {}, hints };
  }

  const headers = {
    Authorization: `Bearer ${options.personalApiKey}`,
  };

  const res = await fetch(
    `${host}/api/projects/${options.projectId}/feature_flags?active=true`,
    {
      method: 'GET',
      headers,
      // @ts-expect-error used by some Next.js versions
      cache: 'no-store',
    },
  );

  if (res.status !== 200) {
    return {
      definitions: {},
      hints: [
        {
          key: `posthog/response-not-ok/${options.projectId}`,
          text: `Failed to fetch PostHog (Received ${res.status} response)`,
        },
      ],
    };
  }

  try {
    const data = (await res.json()) as ApiData;
    const items: ApiData['results'] = [...data.results];

    // paginate in a parallel request
    for (let offset = 100; offset < data.count; offset += 100) {
      const paginatedRes = await fetch(
        `${host}/api/projects/${options.projectId}/feature_flags?active=true&offset=${offset}&limit=100`,
        {
          method: 'GET',
          headers,
          // @ts-expect-error used by some Next.js versions
          cache: 'no-store',
        },
      );

      if (paginatedRes.status === 200) {
        const paginatedData = (await paginatedRes.json()) as ApiData;
        items.push(...paginatedData.results);
      } else {
        hints.push({
          key: `posthog/response-not-ok/${options.projectId}-${offset}`,
          text: `Failed to fetch PostHog (Received ${paginatedRes.status} response)`,
        });
      }
    }

    return {
      definitions: items.reduce<FlagDefinitionsType>((acc, item) => {
        acc[item.key] = {
          origin: `${host}/project/${options.projectId}/feature_flags/${item.id}`,
          description: item.name,
          createdAt: new Date(item.created_at).getTime(),
          options: !item.filters.payloads
            ? [{ value: false }, { value: true }]
            : Object.entries(item.filters.payloads ?? {}).map(
                ([key, value]) => ({
                  value: JSON.parse(value),
                  label: key,
                }),
              ),
        };
        return acc;
      }, {}),
      hints,
    };
  } catch (e) {
    return {
      definitions: {},
      hints: [
        {
          key: `posthog/response-not-ok/${options.projectId}`,
          text: 'Failed to fetch PostHog',
        },
      ],
    };
  }
}

export const getAppHost = (apiHost?: string) => {
  const host = apiHost ?? process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!host) {
    throw new Error('NEXT_PUBLIC_POSTHOG_HOST is not set');
  }

  if (host.includes('us.i.posthog.com')) {
    return 'https://us.posthog.com';
  }

  if (host.includes('eu.i.posthog.com')) {
    return 'https://eu.posthog.com';
  }

  return host;
};
