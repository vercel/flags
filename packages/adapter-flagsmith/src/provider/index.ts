import type { FlagDefinitionType, ProviderData } from 'flags';

type FlagsmithApiData = {
  id: number;
  feature: {
    id: number;
    name: string;
    created_date: string;
    description: string;
    initial_value: string;
    default_enabled: boolean;
    type: string;
  };
  feature_state_value: string;
  environment: number;
  identity: number;
  feature_segment: number;
  enabled: boolean;
}[];

export async function getProviderData(options: {
  environmentKey: string;
  projectId: string;
}): Promise<ProviderData> {
  const hints: Exclude<ProviderData['hints'], undefined> = [];

  if (!options.environmentKey) {
    hints.push({
      key: 'flagsmith/missing-environment-id',
      text: 'Missing Flagsmith Environment ID',
    });
  }

  if (!options.projectId) {
    hints.push({
      key: 'flagsmith/missing-project-id',
      text: 'Missing Flagsmith Project ID',
    });
  }

  if (hints.length > 0) return { definitions: {}, hints };

  try {
    const res = await fetch(`https://api.flagsmith.com/api/v1/flags/`, {
      method: 'GET',
      headers: {
        'X-Environment-Key': options.environmentKey,
      },
      // @ts-expect-error used by some Next.js versions
      cache: 'no-store',
    });

    if (res.status !== 200) {
      return {
        definitions: {},
        hints: [
          {
            key: `flagsmith/response-not-ok/${options.environmentKey}`,
            text: `Failed to fetch Flagsmith (Received ${res.status} response)`,
          },
        ],
      };
    }

    const data = (await res.json()) as FlagsmithApiData;
    const definitions = data?.reduce<Record<string, FlagDefinitionType>>(
      (acc, flag) => {
        acc[flag.feature.name] = {
          origin: `https://app.flagsmith.com/project/${options.projectId}/environment/${options.environmentKey}/features/?feature=${flag?.id}`,
          description: flag.feature.description,
          createdAt: new Date(flag.feature.created_date).getTime(),
          options: [
            {
              value: flag.feature_state_value,
              label: flag.feature_state_value,
            },
          ],
        };
        return acc;
      },
      {},
    );

    return {
      definitions,
      hints: [],
    };
  } catch (error) {
    return {
      definitions: {},
      hints: [
        {
          key: 'flagsmith/response-not-ok',
          text: `Failed to fetch Flagsmith`,
        },
      ],
    };
  }
}
