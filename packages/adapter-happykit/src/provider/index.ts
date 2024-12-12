import type {
  FlagDefinitionType,
  JsonValue,
  ProviderData,
} from '@vercel/flags';

interface ProjectResponseBody {
  project: {
    slug: string;
  };
  owner: {
    slug: string;
  };
  flags: {
    slug: string;
    description: string;
    updatedAt: string;
    createdAt: string;
    variants: {
      name: string;
      value: JsonValue;
    }[];
  }[];
}

export async function getHappyKitData(options: {
  /**
   * The private API Token used to load your feature flags from HappyKit's API.
   */
  apiToken: string;
  /**
   * The public environment key used to identify your project and environment.
   * @example flags_pub_development_272357356657967622
   */
  envKey: string;
}): Promise<ProviderData> {
  const hints: Exclude<ProviderData['hints'], undefined> = [];

  if (!options.apiToken) {
    hints.push({
      key: 'happykit/missing-api-token',
      text: 'Missing HappyKit API Token',
    });
  }

  if (!options.envKey) {
    hints.push({
      key: 'happykit/missing-env-key',
      text: 'Missing HappyKit Environment Key',
    });
  }

  // Abort early if called with incomplete options.
  if (hints.length > 0) return { definitions: {}, hints };

  const response = await fetch(
    `https://happykit.dev/api/project/${options.envKey}`,
    {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${options.apiToken}`,
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
          key: 'happykit/response-not-ok',
          text: `Failed to fetch HappyKit (Received ${response.status} response)`,
        },
      ],
    };
  }

  const body = (await response.json()) as ProjectResponseBody;

  const env = options.envKey.startsWith('flags_pub_development_')
    ? 'development'
    : options.envKey.startsWith('flags_pub_preview_')
      ? 'preview'
      : 'production';

  const definitions = body.flags.reduce<Record<string, FlagDefinitionType>>(
    (acc, flag) => {
      acc[flag.slug] = {
        origin: `https://happykit.dev/${body.owner.slug}/${body.project.slug}/flag/${env}/${flag.slug}`,
        description: flag.description,
        updatedAt: flag.updatedAt
          ? new Date(flag.updatedAt).getTime()
          : undefined,
        createdAt: flag.createdAt
          ? new Date(flag.createdAt).getTime()
          : undefined,
        options: flag.variants.map((variant) => ({
          value: variant.value,
          label: variant.name,
        })),
      };
      return acc;
    },
    {},
  );

  return { definitions, hints };
}
