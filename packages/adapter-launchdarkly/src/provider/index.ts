import type { FlagDefinitionsType, JsonValue, ProviderData } from 'flags';

// See: https://apidocs.launchdarkly.com/tag/Feature-flags#operation/getFeatureFlags
interface LaunchDarklyApiData {
  items: {
    key: string;
    variations: { value: JsonValue; name?: string }[];
    description: string;
    creationDate: number;
    defaults: {
      offVariation: number;
    };
  }[];
  totalCount: number;
}

/** Maximum number of paginated requests to prevent runaway loops from a spoofed totalCount */
const MAX_PAGINATION_REQUESTS = 100;

/** Validates that a projectKey is safe for URL interpolation */
function isValidProjectKey(key: string): boolean {
  return /^[\w.-]+$/.test(key);
}

export async function getProviderData(options: {
  apiKey: string;
  environment: string;
  projectKey: string;
}): Promise<ProviderData> {
  const hints: Exclude<ProviderData['hints'], undefined> = [];

  if (!options.apiKey) {
    hints.push({
      key: 'launchdarkly/missing-api-key',
      text: 'Missing LaunchDarkly API Key',
    });
  }

  if (!options.environment) {
    hints.push({
      key: 'launchdarkly/missing-environment',
      text: 'Missing LaunchDarkly API Key',
    });
  }

  if (!options.projectKey) {
    hints.push({
      key: 'launchdarkly/missing-environment',
      text: 'Missing LaunchDarkly Project Key',
    });
  }

  if (hints.length > 0) {
    return { definitions: {}, hints };
  }

  // Validate projectKey to prevent path traversal/injection in URL
  if (!isValidProjectKey(options.projectKey)) {
    return {
      definitions: {},
      hints: [
        {
          key: 'launchdarkly/invalid-project-key',
          text: 'Invalid LaunchDarkly project key format',
        },
      ],
    };
  }

  const headers = {
    Authorization: options.apiKey,
    'LD-API-Version': '20240415',
  };

  const res = await fetch(
    `https://app.launchdarkly.com/api/v2/flags/${encodeURIComponent(options.projectKey)}?offset=0&limit=100&sort=creationDate`,
    {
      method: 'GET',
      headers,
      cache: 'no-store',
    },
  );

  if (res.status !== 200) {
    return {
      definitions: {},
      hints: [
        {
          key: `launchdarkly/response-not-ok/${options.projectKey}`,
          text: `Failed to fetch LaunchDarkly (Received ${res.status} response)`,
        },
      ],
    };
  }

  try {
    const data = (await res.json()) as LaunchDarklyApiData;
    const items: LaunchDarklyApiData['items'] = [...data.items];

    // Clamp totalCount to prevent a spoofed response from causing excessive requests
    const maxOffset = Math.min(
      data.totalCount,
      MAX_PAGINATION_REQUESTS * 100,
    );
    for (let offset = 100; offset < maxOffset; offset += 100) {
      const paginatedRes = await fetch(
        `https://app.launchdarkly.com/api/v2/flags/${encodeURIComponent(options.projectKey)}?offset=${offset}&limit=100&sort=creationDate`,
        {
          method: 'GET',
          headers,
          cache: 'no-store',
        },
      );

      if (paginatedRes.status === 200) {
        const paginatedData =
          (await paginatedRes.json()) as LaunchDarklyApiData;
        items.push(...paginatedData.items);
      } else {
        hints.push({
          key: `launchdarkly/response-not-ok/${options.projectKey}-${offset}`,
          text: `Failed to fetch LaunchDarkly (Received ${paginatedRes.status} response)`,
        });
      }
    }

    return {
      definitions: items.reduce<FlagDefinitionsType>((acc, item) => {
        acc[item.key] = {
          // defaultValue: item.variations[item.defaults.offVariation].value,
          origin: `https://app.launchdarkly.com/${encodeURIComponent(options.projectKey)}/${encodeURIComponent(options.environment)}/features/${encodeURIComponent(item.key)}/targeting`,
          description: item.description,
          createdAt: item.creationDate,
          options: item.variations.map((variation) => ({
            value: variation.value,
            label: variation.name,
          })),
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
          key: `launchdarkly/response-not-ok/${options.projectKey}`,
          text: `Failed to fetch LaunchDarkly`,
        },
      ],
    };
  }
}
