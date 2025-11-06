import type { JsonValue, ProviderData } from 'flags';

interface DatabuddyFlag {
  id: string;
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  flagType: 'boolean' | 'multivariant' | 'rollout';
  variants?: Array<{
    name: string;
    value: JsonValue;
    weight?: number;
  }>;
  dependencies?: Array<{
    flagKey: string;
    requiredValue?: JsonValue;
  }>;
  environment?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DatabuddyFlagsResponse {
  flags: DatabuddyFlag[];
  count: number;
}

export async function getProviderData(options: {
  /** Databuddy Client ID **/
  clientId: string;
  /** Databuddy API Key **/
  apiKey: string;
  /** Override the API host for self-hosted users **/
  apiUrl?: string;
  /** Dashboard origin URL **/
  dashboardUrl?: string;
  /** Environment context (dev, staging, production) **/
  environment?: string;
}): Promise<ProviderData> {
  const { clientId, apiKey, environment = 'production' } = options;
  const apiUrl = options.apiUrl || 'https://api.databuddy.cc';
  const dashboardUrl = options.dashboardUrl || 'https://dashboard.databuddy.cc';

  if (!clientId || !apiKey) {
    return {
      definitions: {},
      hints: [
        {
          key: 'databuddy/missing-credentials',
          text: 'Missing Databuddy Client ID or API Key',
        },
      ],
    };
  }

  const hints: ProviderData['hints'] = [];

  const flags = await getFlags({ clientId, apiKey, apiUrl, environment });

  if (flags instanceof Error) {
    return {
      definitions: {},
      hints: [
        {
          key: 'databuddy/fetch-failed',
          text: flags.message,
        },
      ],
    };
  }

  const definitions: ProviderData['definitions'] = {};

  for (const flag of flags) {
    let options: { label: string; value: JsonValue }[] = [];

    switch (flag.flagType) {
      case 'boolean':
        options = [
          { label: 'On', value: true },
          { label: 'Off', value: false },
        ];
        break;

      case 'multivariant':
        if (flag.variants && flag.variants.length > 0) {
          options = flag.variants.map((variant) => ({
            label: variant.name,
            value: variant.value,
          }));
        } else {
          hints.push({
            key: 'databuddy/invalid-multivariant',
            text: `Multivariant flag "${flag.key}" has no variants defined`,
          });
        }
        break;

      case 'rollout':
        options = [
          { label: 'Enabled', value: true },
          { label: 'Disabled', value: false },
        ];
        break;

      default:
        hints.push({
          key: 'databuddy/invalid-flag-type',
          text: `Invalid flag type for "${flag.key}": ${flag.flagType}`,
        });
    }

    let description = flag.description || flag.name;

    // Add flag type label
    const typeLabel =
      flag.flagType === 'multivariant'
        ? 'Multi-Variant'
        : flag.flagType.charAt(0).toUpperCase() + flag.flagType.slice(1);
    description = `[${typeLabel}] ${description}`;

    // Add dependencies info if present
    if (flag.dependencies && flag.dependencies.length > 0) {
      const depKeys = flag.dependencies.map((d) => d.flagKey).join(', ');
      description += ` (depends on: ${depKeys})`;
    }

    // Add environment info
    if (flag.environment) {
      description += ` [${flag.environment}]`;
    }

    definitions[flag.key] = {
      description,
      origin: `${dashboardUrl}/flags/${flag.id}`,
      options,
      createdAt: flag.createdAt ? new Date(flag.createdAt).getTime() : undefined,
      updatedAt: flag.updatedAt ? new Date(flag.updatedAt).getTime() : undefined,
    };
  }

  return { definitions, hints };
}

/**
 * Fetch all Feature Flags from Databuddy.
 */
async function getFlags(options: {
  clientId: string;
  apiKey: string;
  apiUrl: string;
  environment: string;
}): Promise<DatabuddyFlag[] | Error> {
  try {
    const params = new URLSearchParams();
    params.set('clientId', options.clientId);
    params.set('environment', options.environment);

    const url = `${options.apiUrl}/public/v1/flags/all?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (response.status !== 200) {
      await response.arrayBuffer(); // ensure stream is drained
      return new Error(
        `Failed to fetch Databuddy flags (Received ${response.status} response)`,
      );
    }

    const body = (await response.json()) as DatabuddyFlagsResponse;
    return body.flags;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}
