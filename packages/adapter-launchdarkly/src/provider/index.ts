import type {
  FlagDefinitionsType,
  JsonValue,
  ProviderData,
} from '@vercel/flags';

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

  const headers = {
    Authorization: options.apiKey,
    'LD-API-Version': '20240415',
  };

  const res = await fetch(
    `https://app.launchdarkly.com/api/v2/flags/${options.projectKey}?offset=0&limit=100&sort=creationDate`,
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
          key: `launchdarkly/response-not-ok/${options.projectKey}`,
          text: `Failed to fetch LaunchDarkly (Received ${res.status} response)`,
        },
      ],
    };
  }

  try {
    const data = (await res.json()) as LaunchDarklyApiData;
    const items: LaunchDarklyApiData['items'] = [...data.items];

    // paginate in a parallel
    for (let offset = 100; offset < data.totalCount; offset += 100) {
      const paginatedRes = await fetch(
        `https://app.launchdarkly.com/api/v2/flags/${options.projectKey}?offset=${offset}&limit=100&sort=creationDate`,
        {
          method: 'GET',
          headers,
          // @ts-expect-error used by some Next.js versions
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
          origin: `https://app.launchdarkly.com/${options.projectKey}/${options.environment}/features/${item.key}/targeting`,
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
  } catch (e) {
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
