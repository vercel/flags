import {
  createClientFromConnectionString,
  type FlagsClient,
  getDefaultFlagsClient,
  Reason,
  store,
} from '@vercel/flags-core';
import type { Adapter, FlagDeclaration } from 'flags';

export type VercelAdapterDeclaration<ValueType, EntitiesType> = Omit<
  FlagDeclaration<ValueType, EntitiesType>,
  'decide' | 'origin'
>;

/**
 * Allows creating a custom Vercel adapter for feature flags
 */
export function createVercelAdapter(
  // usually a connection string, but can also be a pre-configured FlagsClient
  connectionStringOrFlagsClient: string | FlagsClient,
) {
  const flagsClient =
    typeof connectionStringOrFlagsClient === 'string'
      ? createClientFromConnectionString(connectionStringOrFlagsClient)
      : connectionStringOrFlagsClient;

  return function vercelAdapter<ValueType, EntitiesType>(): Adapter<
    ValueType,
    EntitiesType
  > {
    return {
      origin: {
        provider: 'vercel',
        projectId: flagsClient.dataSource.projectId,
        env: flagsClient.environment,
      },
      config: { reportValue: false },
      async decide({ key, entities, headers }): Promise<ValueType> {
        const evaluationResultPromise = store.run(headers, async () => {
          return flagsClient.evaluate<ValueType, EntitiesType>(
            key,
            undefined,
            entities,
          );
        });

        const evaluationResult = await evaluationResultPromise;
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
    defaultVercelAdapter = createVercelAdapter(getDefaultFlagsClient());
  }

  return defaultVercelAdapter<ValueType, EntitiesType>();
}
