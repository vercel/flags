import {
  createClient,
  type FlagsClient,
  flagsClient,
  Reason,
} from '@vercel/flags-core';
import type {
  Adapter,
  FlagDeclaration,
  FlagDefinitionsType,
  FlagDefinitionType,
  ProviderData,
} from 'flags';
import type { KeyedFlagDefinitionType } from 'flags/next';

export type VercelAdapterDeclaration<ValueType, EntitiesType> = Omit<
  FlagDeclaration<ValueType, EntitiesType>,
  'decide' | 'origin'
>;

/**
 * Allows creating a custom Vercel adapter for feature flags
 */
export function createVercelAdapter(
  // usually a connection string, but can also be a pre-configured FlagsClient
  sdkKeyOrFlagsClient: string | FlagsClient,
) {
  const flagsClient =
    typeof sdkKeyOrFlagsClient === 'string'
      ? createClient(sdkKeyOrFlagsClient)
      : sdkKeyOrFlagsClient;

  return function vercelAdapter<ValueType, EntitiesType>(): Adapter<
    ValueType,
    EntitiesType
  > {
    return {
      origin: flagsClient.origin,
      config: { reportValue: false },
      async decide({ key, entities, headers }): Promise<ValueType> {
        const evaluationResult = await flagsClient.evaluate<
          ValueType,
          EntitiesType
        >(key, undefined, entities);

        if (evaluationResult.value === undefined) {
          // if there was no defaultValue we need to throw
          throw new Error(
            evaluationResult.reason === Reason.ERROR &&
              evaluationResult.errorMessage
              ? `flags: Could not evaluate flag "${key}". ${evaluationResult.errorMessage}`
              : `flags: Could not evaluate flag "${key}"`,
          );
        }

        // runs when the flag evaluates successfully or
        // when there was an error but the defaultValue was set
        return evaluationResult.value;
      },
    };
  };
}

let defaultVercelAdapter: ReturnType<typeof createVercelAdapter> | undefined;

/**
 * Internal function for testing purposes
 */
export function resetDefaultVercelAdapter() {
  defaultVercelAdapter = undefined;
}

/**
 * A default Vercel adapter for feature flags
 *
 */
// This is initialized lazily to avoid warning when it is not actually used and env vars are missing.
export function vercelAdapter<ValueType, EntitiesType>(): Adapter<
  ValueType,
  EntitiesType
> {
  if (!defaultVercelAdapter) {
    defaultVercelAdapter = createVercelAdapter(flagsClient);
  }

  return defaultVercelAdapter<ValueType, EntitiesType>();
}

const flagsClients = new Map<string, FlagsClient>();

function getOrCreateClient(sdkKey: string): FlagsClient {
  let client = flagsClients.get(sdkKey);
  if (!client) {
    client = createClient(sdkKey);
    flagsClients.set(sdkKey, client);
  }
  return client;
}

function isVercelOrigin(
  origin: unknown,
): origin is { provider: 'vercel'; sdkKey: string } {
  return (
    typeof origin === 'object' &&
    origin !== null &&
    'provider' in origin &&
    (origin as Record<string, unknown>).provider === 'vercel' &&
    'sdkKey' in origin &&
    typeof (origin as Record<string, unknown>).sdkKey === 'string'
  );
}

export async function getProviderData(
  flags: Record<
    string,
    // accept an unknown array
    KeyedFlagDefinitionType | readonly unknown[]
  >,
): Promise<ProviderData> {
  const flagDefs = Object.values(flags)
    // filter out precomputed arrays
    .filter((i): i is KeyedFlagDefinitionType => !Array.isArray(i));

  // Collect unique sdkKeys and resolve their projectIds
  const sdkKeys = new Set<string>();
  for (const d of flagDefs) {
    if (isVercelOrigin(d.origin)) {
      sdkKeys.add(d.origin.sdkKey);
    }
  }

  const projectIdBySdkKey = new Map<string, string>();
  await Promise.all(
    Array.from(sdkKeys).map(async (sdkKey) => {
      const client = getOrCreateClient(sdkKey);
      try {
        const fallback = await client.getFallbackDatafile();
        projectIdBySdkKey.set(sdkKey, fallback.projectId);
      } catch {
        const datafile = await client.getDatafile();
        projectIdBySdkKey.set(sdkKey, datafile.projectId);
      }
    }),
  );

  const definitions = flagDefs.reduce<FlagDefinitionsType>((acc, d) => {
    if (!isVercelOrigin(d.origin)) return acc;

    const projectId = projectIdBySdkKey.get(d.origin.sdkKey)!;
    acc[d.key] = {
      options: d.options,
      origin: {
        provider: 'vercel',
        projectId,
      },
      description: d.description,
      defaultValue: d.defaultValue,
      declaredInCode: true,
    } satisfies FlagDefinitionType;

    return acc;
  }, {});

  return { definitions, hints: [] };
}
