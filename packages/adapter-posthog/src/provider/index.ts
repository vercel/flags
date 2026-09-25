import type { FlagDefinitionsType, ProviderData } from 'flags';

interface PostHogFlag {
  id: number;
  key: string;
  name: string;
  created_at?: string;
  filters: {
    payloads?: Record<string, string>;
    multivariate?: {
      variants?: { key: string; name?: string }[];
    } | null;
  };
}

// Management API response (personal API keys).
interface ApiData {
  count: number;
  results: PostHogFlag[];
}

// Definitions API response (project secret API keys).
interface DefinitionsData {
  flags: PostHogFlag[];
}

type ProviderOptions = {
  projectId: string;
  appHost?: string;
} & (
  | { personalApiKey: string; projectSecretApiKey?: never; apiHost?: never }
  | { projectSecretApiKey: string; personalApiKey?: never; apiHost?: string }
);

export async function getProviderData(
  options: ProviderOptions,
): Promise<ProviderData> {
  const useDefinitions = 'projectSecretApiKey' in options;
  const apiKey = useDefinitions
    ? options.projectSecretApiKey
    : options.personalApiKey;
  const hints: Exclude<ProviderData['hints'], undefined> = [];

  if (!apiKey) {
    hints.push({
      key: useDefinitions
        ? 'posthog/missing-project-secret-api-key'
        : 'posthog/missing-personal-api-key',
      text: useDefinitions
        ? 'Missing PostHog Project Secret API Key'
        : 'Missing PostHog Personal API Key',
    });
  }

  let host = options.appHost;
  if (!host) {
    try {
      host = getAppHost(options.apiHost);
    } catch {
      hints.push({
        key: 'posthog/missing-app-host',
        text: 'Missing POSTHOG_HOST environment variable',
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
    Authorization: `Bearer ${apiKey}`,
  };

  // Definitions are served by the ingestion host, not the management API.
  const apiHost = useDefinitions
    ? (options.apiHost ?? getApiHost(host!)).replace(/\/$/, '')
    : undefined;
  const endpoint = useDefinitions
    ? `${apiHost}/flags/definitions/`
    : `${host}/api/projects/${options.projectId}/feature_flags`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

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
    const data = (await res.json()) as ApiData | DefinitionsData;
    const items = useDefinitions
      ? [...(data as DefinitionsData).flags]
      : [...(data as ApiData).results];

    // Only the management API paginates its response.
    const count = useDefinitions ? 0 : (data as ApiData).count;
    for (let offset = 100; offset < count; offset += 100) {
      const paginatedRes = await fetch(
        `${host}/api/projects/${options.projectId}/feature_flags?offset=${offset}&limit=100`,
        {
          method: 'GET',
          headers,
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
          ...(item.created_at
            ? { createdAt: new Date(item.created_at).getTime() }
            : {}),
          options: getFlagOptions(item),
        };
        return acc;
      }, {}),
      hints,
    };
  } catch {
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
  const host = apiHost ?? process.env.POSTHOG_HOST;

  if (!host) {
    throw new Error('POSTHOG_HOST is not set');
  }

  let hostname: string;
  try {
    hostname = new URL(host).hostname;
  } catch {
    hostname = host;
  }

  if (hostname === 'us.i.posthog.com') {
    return 'https://us.posthog.com';
  }

  if (hostname === 'eu.i.posthog.com') {
    return 'https://eu.posthog.com';
  }

  return host;
};

function getApiHost(host: string): string {
  const appHost = host.replace(/\/$/, '');
  if (appHost === 'https://us.posthog.com') return 'https://us.i.posthog.com';
  if (appHost === 'https://eu.posthog.com') return 'https://eu.i.posthog.com';
  return host;
}

function getFlagOptions(item: PostHogFlag) {
  const payloads = Object.entries(item.filters.payloads ?? {});
  // Preserve the existing payload-based options for payload adapters.
  if (payloads.length > 0) {
    return payloads.map(([key, value]) => ({
      value: JSON.parse(value),
      label: key,
    }));
  }

  const variants = item.filters.multivariate?.variants;
  if (variants?.length) {
    return [
      { value: false },
      ...variants.map((variant) => ({
        value: variant.key,
        label: variant.name || variant.key,
      })),
    ];
  }

  return [{ value: false }, { value: true }];
}
