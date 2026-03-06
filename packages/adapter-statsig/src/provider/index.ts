import type { JsonValue, ProviderData } from 'flags';

// See: https://docs.statsig.com/console-api/gates/#get-/console/v1/gates
interface StatsigFeatureGateResponse {
  data: {
    id: string;
    name: string;
    description: string;
    rules: Record<string, unknown>[];
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

export async function getProviderData(
  options: {
    /**
     * Required to set the `origin` property on the flag definitions.
     */
    projectId?: string;
  } & (
    | {
        /**
         * The Statsig Console API key.
         */
        consoleApiKey: string;
        /**
         * @deprecated Use `consoleApiKey` instead.
         */
        statsigConsoleApiKey?: never;
      }
    | {
        /**
         * @deprecated Use `consoleApiKey` instead.
         */
        statsigConsoleApiKey: string;
        /**
         * The Statsig Console API key.
         */
        consoleApiKey?: never;
      }
  ),
): Promise<ProviderData> {
  const consoleApiKey = options.consoleApiKey || options.statsigConsoleApiKey;

  if (!consoleApiKey) {
    return {
      definitions: {},
      hints: [
        {
          key: 'statsig/missing-api-key',
          text: 'Missing Statsig Console API Key',
        },
      ],
    };
  }

  const hints: ProviderData['hints'] = [];

  // Abort early if called with incomplete options.
  const [gates, experiments] = await Promise.allSettled([
    getFeatureGates({ consoleApiKey }),
    getExperiments({ consoleApiKey }),
  ] as const);

  const definitions: ProviderData['definitions'] = {};

  if (gates.status === 'fulfilled') {
    gates.value.forEach((gate) => {
      definitions[gate.id] = {
        description: gate.description,
        origin: options.projectId
          ? `https://console.statsig.com/${encodeURIComponent(options.projectId)}/gates/${encodeURIComponent(gate.id)}`
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
    // Avoid leaking sensitive details (e.g. API keys) from error messages
    const safeMessage =
      gates.reason instanceof Error
        ? gates.reason.message.replace(/key[=:]\S+/gi, 'key=[REDACTED]')
        : 'Failed to load feature gates';
    hints.push({
      key: 'statsig/failed-to-load-feature-gates',
      text: safeMessage,
    });
  }

  if (experiments.status === 'fulfilled') {
    experiments.value.forEach((experiment) => {
      definitions[experiment.id] = {
        description: experiment.description,
        origin: options.projectId
          ? `https://console.statsig.com/${encodeURIComponent(options.projectId)}/experiments/${encodeURIComponent(experiment.id)}/setup`
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
    const safeMessage =
      experiments.reason instanceof Error
        ? experiments.reason.message.replace(/key[=:]\S+/gi, 'key=[REDACTED]')
        : 'Failed to load experiments';
    hints.push({
      key: 'statsig/failed-to-load-experiments',
      text: safeMessage,
    });
  }

  return { definitions, hints };
}

/** Maximum number of pages to fetch to prevent infinite pagination loops */
const MAX_PAGINATION_PAGES = 100;

/**
 * Validates that a pagination URL stays within the expected Statsig API domain
 * to prevent SSRF via malicious nextPage values.
 */
function isValidStatsigUrl(suffix: string): boolean {
  // nextPage must be a relative path starting with /
  return suffix.startsWith('/console/v1/');
}

/**
 * Fetch all Feature Gates.
 */
async function getFeatureGates(options: { consoleApiKey: string }) {
  const data: StatsigFeatureGateResponse['data'] = [];

  let suffix: string | null = '/console/v1/gates';
  let pageCount = 0;

  do {
    if (pageCount++ >= MAX_PAGINATION_PAGES) {
      console.warn(
        '@flags-sdk/statsig: Maximum pagination pages reached for feature gates',
      );
      break;
    }

    if (!isValidStatsigUrl(suffix)) {
      console.warn(
        '@flags-sdk/statsig: Invalid pagination URL for feature gates, stopping',
      );
      break;
    }

    const response = await fetch(`https://statsigapi.net${suffix}`, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'STATSIG-API-KEY': options.consoleApiKey,
      },
      cache: 'no-store',
    });

    if (response.status !== 200) {
      // Consume the response body to free up connections.
      await response.arrayBuffer();

      throw new Error(
        `Failed to fetch Statsig feature gates (Received ${response.status} response)`,
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
  let pageCount = 0;

  do {
    if (pageCount++ >= MAX_PAGINATION_PAGES) {
      console.warn(
        '@flags-sdk/statsig: Maximum pagination pages reached for experiments',
      );
      break;
    }

    if (!isValidStatsigUrl(suffix)) {
      console.warn(
        '@flags-sdk/statsig: Invalid pagination URL for experiments, stopping',
      );
      break;
    }

    const response = await fetch(`https://statsigapi.net${suffix}`, {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'STATSIG-API-KEY': options.consoleApiKey,
      },
      cache: 'no-store',
    });

    if (response.status !== 200) {
      // Consume the response body to free up connections.
      await response.arrayBuffer();

      throw new Error(
        `Failed to fetch Statsig experiments (Received ${response.status} response)`,
      );
    }

    const body = (await response.json()) as StatsigExperimentsResponse;
    suffix = body.pagination?.nextPage || null;
    data.push(...body.data);
  } while (suffix);

  return data;
}
