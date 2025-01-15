import type { JsonValue, ProviderData } from '@vercel/flags';

// See: https://docs.statsig.com/console-api/gates/#get-/console/v1/gates
interface StatsigFeatureGateResponse {
  data: {
    id: string;
    name: string;
    description: string;
    rules: {}[];
    createdTime: number;
    lastModifiedTime: number;
  }[];
  pagination?: {
    itemsPerPage: number;
    pageNumber: number;
    totalItems: number;
    nextPage: null | string;
    previousPage: null | string;
    all: string;
  };
}

// See: https://docs.statsig.com/console-api/experiments#get-/console/v1/experiments
interface StatsigExperimentsResponse {
  data: {
    id: string;
    name: string;
    description: string;
    groups: {
      name: string;
      parameterValues: Record<string, JsonValue>;
    }[];
    createdTime: number;
    lastModifiedTime: number;
  }[];
  pagination?: {
    itemsPerPage: number;
    pageNumber: number;
    totalItems: number;
    nextPage: null | string;
    previousPage: null | string;
    all: string;
  };
}

export async function getProviderData(options: {
  consoleApiKey: string;
  /**
   * Required to set the `origin` property on the flag definitions.
   */
  projectId?: string;
}): Promise<ProviderData> {
  const hints = [];

  if (!options.consoleApiKey) {
    hints.push({
      key: 'statsig/missing-api-key',
      text: 'Missing Statsig Console API Key',
    });
  }

  // Abort early if called with incomplete options.
  if (hints.length > 0) return { definitions: {}, hints };

  const [gates, experiments] = await Promise.allSettled([
    getFeatureGates(options),
    getExperiments(options),
  ] as const);

  const definitions: ProviderData['definitions'] = {};

  if (gates.status === 'fulfilled') {
    gates.value.forEach((gate) => {
      definitions[gate.id] = {
        description: gate.description,
        origin: options.projectId
          ? `https://console.statsig.com/${options.projectId}/gates/${gate.id}`
          : undefined,
        options: [
          { label: 'Off', value: false },
          { label: 'On', value: true },
        ],
        createdAt: gate.createdTime,
        updatedAt: gate.lastModifiedTime,
      };
    });
  } else {
    hints.push({
      key: 'statsig/failed-to-load-feature-gates',
      text: gates.reason.message,
    });
  }

  if (experiments.status === 'fulfilled') {
    experiments.value.forEach((experiment) => {
      definitions[experiment.id] = {
        description: experiment.description,
        origin: options.projectId
          ? `https://console.statsig.com/${options.projectId}/experiments/${experiment.id}/setup`
          : undefined,
        options: experiment.groups.map((group) => {
          return {
            label: group.name,
            value: group.parameterValues,
          };
        }),
        createdAt: experiment.createdTime,
        updatedAt: experiment.lastModifiedTime,
      };
    });
  } else {
    hints.push({
      key: 'statsig/failed-to-load-experiments',
      text: experiments.reason.message,
    });
  }

  return { definitions, hints };
}

/**
 * Fetch all Feature Gates.
 */
async function getFeatureGates(options: { consoleApiKey: string }) {
  const data: StatsigFeatureGateResponse['data'] = [];

  let suffix: string | null = '/console/v1/gates';

  do {
    const response = await fetch(`https://statsigapi.net${suffix}`, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'STATSIG-API-KEY': options.consoleApiKey,
      },
      // @ts-expect-error some Next.js versions need this
      cache: 'no-store',
    });

    if (response.status !== 200) {
      // Consume the response body to free up connections.
      await response.arrayBuffer();

      throw new Error(
        `Failed to fetch Statsig (Received ${response.status} response)`,
      );
    }

    const body = (await response.json()) as StatsigFeatureGateResponse;
    suffix = body.pagination?.nextPage || null;
    data.push(...body.data);
  } while (suffix);

  return data;
}

/**
 * Fetch all experiments.
 */
async function getExperiments(options: { consoleApiKey: string }) {
  const data: StatsigExperimentsResponse['data'] = [];

  let suffix: string | null = '/console/v1/experiments';

  do {
    const response = await fetch(`https://statsigapi.net${suffix}`, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'STATSIG-API-KEY': options.consoleApiKey,
      },
      // @ts-expect-error some Next.js versions need this
      cache: 'no-store',
    });

    if (response.status !== 200) {
      // Consume the response body to free up connections.
      await response.arrayBuffer();

      throw new Error(
        `Failed to fetch Statsig (Received ${response.status} response)`,
      );
    }

    const body = (await response.json()) as StatsigExperimentsResponse;
    suffix = body.pagination?.nextPage || null;
    data.push(...body.data);
  } while (suffix);

  return data;
}
