export async function getProviderData(options) {
  const apiKey = options.apiKey;
  const appApiHost = options.appApiHost || 'https://api.growthbook.io';
  const appOrigin = options.appOrigin || 'https://app.growthbook.io';
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
  const hints = [];
  const features = await getFeatures({ apiKey, appApiHost });
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
  const definitions = {};
  for (const feature of features) {
    if (feature.archived) continue;
    let options = [];
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
    }
    definitions[feature.id] = {
      description: feature.description,
      origin: `${appOrigin}/features/${feature.id}`,
      options,
      createdAt: feature.dateCreated,
      updatedAt: feature.dateUpdated,
    };
  }
  return { definitions, hints };
}
/**
 * Fetch all Feature Flags.
 */
async function getFeatures(options) {
  try {
    const features = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const qs = offset ? `?offset=${offset}` : '';
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
      const body = await response.json();
      features.push(...body.features);
      hasMore = body.hasMore;
      offset = body.nextOffset;
    }
    return features;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}
function tryParseJSON(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
