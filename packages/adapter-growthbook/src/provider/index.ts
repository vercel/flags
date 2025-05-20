import type { JsonValue, ProviderData } from 'flags';

interface GrowthbookFeature {
  id: string;
  dateCreated: string;
  dateUpdated: string;
  archived: boolean;
  description: string;
  owner: string;
  project: string;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  defaultValue: string;
  tags: string[];
  environments: Record<
    string,
    {
      enabled: boolean;
      defaultValue: string;
      rules: {}[];
    }
  >;
  prerequisites: [];
  revision: {};
}

interface GrowthbookFeaturesResponse {
  features: GrowthbookFeature[];
  limit: number;
  offset: number;
  count: number;
  total: number;
  hasMore: boolean;
  nextOffset: number;
}

export async function getProviderData(options: {
  /** GrowthBook API Key or Personal Access Token **/
  apiKey: string;
  /** Override the application API host for self-hosted users **/
  appApiHost?: string;
  /** Override the application URL for self-hosted users **/
  appOrigin?: string;
  /** Provide your GrowthBook SDK key to filter flag definitions **/
  clientKey?: string;
}): Promise<ProviderData> {
  const apiKey = options.apiKey;
  const appApiHost = options.appApiHost || 'https://api.growthbook.io';
  const appOrigin = options.appOrigin || 'https://app.growthbook.io';
  const clientKey = options.clientKey;

  if (!apiKey) {
    return {
      definitions: {},
      hints: [
        {
          key: 'growthbook/missing-api-key',
          text: 'Missing GrowthBook API Key',
        },
      ],
    };
  }

  const hints: ProviderData['hints'] = [];

  const features = await getFeatures({ apiKey, appApiHost, clientKey });

  if (features instanceof Error) {
    return {
      definitions: {},
      hints: [
        {
          key: 'growthbook/fetch-failed',
          text: features.message,
        },
      ],
    };
  }

  const definitions: ProviderData['definitions'] = {};
  for (const feature of features) {
    if (feature.archived) continue;

    let options: { label: string; value: JsonValue }[] = [];
    let invalidType: never;

    switch (feature.valueType) {
      case 'boolean':
        options = [
          { label: 'On', value: true },
          { label: 'Off', value: false },
        ];
        break;
      case 'string':
        options = [
          { label: `"${feature.defaultValue}"`, value: feature.defaultValue },
        ];
        break;
      case 'number':
        options = [
          {
            label: String(feature.defaultValue),
            value: Number(feature.defaultValue),
          },
        ];
        break;
      case 'json':
        options = [
          {
            label: 'JSON',
            value: tryParseJSON(feature.defaultValue),
          },
        ];
        break;
      default:
        invalidType = feature.valueType;
        hints.push({
          key: 'growthbook/invalid-feature-type',
          text: `Invalid feature type: ${feature.valueType}`,
        });
    }
    const typeLabel =
      feature.valueType === 'json'
        ? 'JSON'
        : feature.valueType.charAt(0).toUpperCase() +
          feature.valueType.slice(1);

    definitions[feature.id] = {
      description: `[${typeLabel}] ${feature.description}`,
      origin: `${appOrigin}/features/${feature.id}`,
      options,
      createdAt: new Date(feature.dateCreated).getTime(),
      updatedAt: new Date(feature.dateUpdated).getTime(),
    };
  }

  return { definitions, hints };
}

/**
 * Fetch all Feature Flags.
 */
async function getFeatures(options: {
  apiKey: string;
  appApiHost: string;
  clientKey?: string;
}): Promise<GrowthbookFeature[] | Error> {
  try {
    const features: GrowthbookFeaturesResponse['features'] = [];

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams();
      if (offset) params.append('offset', String(offset));
      if (options.clientKey) params.append('clientKey', options.clientKey);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const url = `${options.appApiHost}/api/v1/features${qs}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
        },
        // @ts-expect-error some Next.js versions need this
        cache: 'no-store',
      });

      if (response.status !== 200) {
        await response.arrayBuffer(); // ensure stream is drained
        return new Error(
          `Failed to fetch GrowthBook (Received ${response.status} response)`,
        );
      }

      const body = (await response.json()) as GrowthbookFeaturesResponse;
      features.push(...body.features);
      hasMore = body.hasMore;
      offset = body.nextOffset;
    }

    return features;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

function tryParseJSON(value: string): JsonValue {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
