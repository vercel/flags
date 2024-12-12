import type { JsonValue, ProviderData } from '@vercel/flags';

// See: https://docs.developers.optimizely.com/feature-experimentation/reference/list_flags
interface OptimizelyFeatureFlagsResponseBody {
  items: {
    key: string;
    name: string;
    description: string;
    created_time: string;
    updated_time: string;
    variable_definitions: Record<
      string,
      {
        key: string;
        description: string;
        type: string;
        default_value: string;
      }
    >;
  }[];
  next_url?: [string];
}

// See: https://docs.developers.optimizely.com/feature-experimentation/reference/list_variations
interface OptimizelyVariationsResponseBody {
  items: {
    key: string;
    name: string;
    description: string;
    variables: Record<
      string,
      {
        key: string;
        type: string;
        value: string;
        is_default: boolean;
      }
    >;
  }[];
  next_url?: [string];
}

export async function getOptimizelyData(options: {
  projectId: string;
  apiKey: string;
}): Promise<ProviderData> {
  const hints: Exclude<ProviderData['hints'], undefined> = [];
  const items: {
    key: string;
    name: string;
    description: string;
    created_time: string;
    updated_time: string;
    variations: OptimizelyVariationsResponseBody['items'];
  }[] = [];

  if (!options.apiKey) {
    hints.push({
      key: 'optimizely/missing-api-key',
      text: 'Missing Optimizely Admin API Key',
    });
  }

  if (!options.projectId) {
    hints.push({
      key: 'optimizely/missing-project-id',
      text: 'Missing Optimizely Project Id',
    });
  }

  // Abort early if called with incomplete options.
  if (hints.length > 0) return { definitions: {}, hints };

  let suffix: undefined | string = `/projects/${options.projectId}/flags`;

  do {
    const response = await fetch(
      `https://api.optimizely.com/flags/v1${suffix}`,
      {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        // @ts-expect-error used by some Next.js versions
        cache: 'no-store',
      },
    );

    if (response.status !== 200) {
      // Consume the response body to free up connections.
      await response.arrayBuffer();

      return {
        definitions: {},
        hints: [
          {
            key: 'optimizely/response-not-ok',
            text: `Failed to fetch Optimizely (Received ${response.status} response)`,
          },
        ],
      };
    }

    const body = (await response.json()) as OptimizelyFeatureFlagsResponseBody;

    for await (const flag of body.items) {
      const variations = await getVariationsForFlag({
        apiKey: options.apiKey,
        projectId: options.projectId,
        flagKey: flag.key,
      });

      if (variations instanceof Error) {
        return {
          definitions: {},
          hints: [
            {
              key: 'optimizely/response-not-ok',
              text: variations.message,
            },
          ],
        };
      }

      items.push({
        ...flag,
        variations,
      });
    }

    suffix = body.next_url?.[0];
  } while (suffix);

  const definitions = items.reduce<ProviderData['definitions']>((acc, item) => {
    acc[item.name] = {
      description: item.description,
      options: item.variations.map((variation) => {
        return {
          label: variation.name,
          value: {
            variationKey: variation.key,
            enabled: true,
            flagKey: item.key,
            variables: transformVariables(variation.variables),
          },
        };
      }),
      origin: `https://app.optimizely.com/v2/projects/${options.projectId}/flags/manage/${item.key}/rules/production`,
      updatedAt: item.updated_time
        ? new Date(item.updated_time).getTime()
        : undefined,
      createdAt: item.created_time
        ? new Date(item.created_time).getTime()
        : undefined,
    };
    return acc;
  }, {});

  return { definitions, hints };
}

/**
 * Fetch all variations
 */
async function getVariationsForFlag(options: {
  projectId: string;
  apiKey: string;
  flagKey: string;
}) {
  const items: OptimizelyVariationsResponseBody['items'] = [];

  let suffix: undefined | string =
    `/projects/${options.projectId}/flags/${options.flagKey}/variations`;

  do {
    const response = await fetch(
      `https://api.optimizely.com/flags/v1${suffix}`,
      {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        // @ts-expect-error used by some Next.js versions
        cache: 'no-store',
      },
    );

    if (response.status !== 200) {
      return new Error(
        `Failed to fetch Optimizely (Received ${response.status} response)`,
      );
    }

    const body = (await response.json()) as OptimizelyVariationsResponseBody;
    suffix = body.next_url?.[0];

    items.push(...body.items);
  } while (suffix);

  return items;
}

/**
 * Transform the raw `variables` to JSON.
 */
function transformVariables(
  variables: OptimizelyVariationsResponseBody['items'][number]['variables'],
) {
  return Object.keys(variables).reduce(
    (acc, nextKey) => {
      const variable = variables[nextKey]!;

      switch (variable.type) {
        case 'string':
          acc[nextKey] = variable.value;
          break;
        case 'integer':
        case 'double':
          acc[nextKey] = Number(variable.value);
          break;
        case 'boolean':
          acc[nextKey] = variable.value === 'true';
          break;
        case 'json':
          acc[nextKey] = JSON.parse(variable.value);
          break;
        default:
          throw new Error(
            `Unexpected variable type: ${variable.type} for variable ${variable.key}`,
          );
      }

      return acc;
    },
    {} as Record<string, JsonValue>,
  );
}
