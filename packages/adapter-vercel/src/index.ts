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

export async function getProviderData(
  flags: Record<
    string,
    // accept an unknown array
    KeyedFlagDefinitionType | readonly unknown[]
  >,
): Promise<ProviderData> {
  const info = await flagsClient.getInfo();

  const definitions = Object.values(flags)
    // filter out precomputed arrays
    .filter((i): i is KeyedFlagDefinitionType => !Array.isArray(i))
    .reduce<FlagDefinitionsType>((acc, d) => {
      acc[d.key] = {
        options: d.options,
        origin: {
          provider: 'vercel',
          projectId: info.projectId,
        },
        description: d.description,
        defaultValue: d.defaultValue,
        declaredInCode: true,
      } satisfies FlagDefinitionType;
      return acc;
    }, {});

  return { definitions, hints: [] };
}
