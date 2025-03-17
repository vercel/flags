import type { ProviderData, JsonValue } from 'flags';

interface DevunusFlag {
  id: string;
  name: string;
  description: string;
  value: string;
  type: 'boolean' | 'string' | 'number' | 'json';
  createdAt: number;
  updatedAt: number;
}

interface DevunusResponse {
  flags: DevunusFlag[];
  baseUrl: string;
}

export async function getProviderData(options: {
  /**
   * The Devunus environment key.
   */
  envKey: string;
}): Promise<ProviderData> {
  if (!options.envKey) {
    return {
      definitions: {},
      hints: [
        {
          key: 'devunus/missing-env-key',
          text: 'Missing DevUnus environment key',
        },
      ],
    };
  }

  try {
    // Get from edge API
    const response = await fetch(`https://api.devunus.com/api/flags`, {
      headers: { Authorization: `${options.envKey}` },
      cache: 'no-store',
    });

    if (response.status !== 200) {
      return {
        definitions: {},
        hints: [
          {
            key: 'devunus/response-not-ok',
            text: `Failed to fetch DevUnus flag definitions (received ${response.status} response)`,
          },
        ],
      };
    }

    const data = (await response.json()) as DevunusResponse;
    const { flags, baseUrl } = data;

    const definitions: ProviderData['definitions'] = {};

    for (const flag of flags) {
      const flagOptions = [];

      // For boolean flags, provide true/false options
      if (flag.type === 'boolean') {
        flagOptions.push({ value: true, label: 'On' });
        flagOptions.push({ value: false, label: 'Off' });
      }

      // For string flags, include the current value as an option
      if (flag.type === 'string') {
        flagOptions.push({ value: flag.value });
      }

      definitions[flag.name] = {
        description: flag.description,
        options: flagOptions,
        origin: `${baseUrl}/flag/${flag.id}`,
        updatedAt: flag.updatedAt,
        createdAt: flag.createdAt,
        defaultValue: flag.value,
      };
    }

    return { definitions, hints: [] };
  } catch (error) {
    return {
      definitions: {},
      hints: [
        {
          key: 'devunus/unexpected-error',
          text: `Unexpected error fetching DevUnus flag definitions: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}
