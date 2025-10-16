import type { Adapter, FlagDeclaration } from 'flags';
import {
  createFlagsClientFromConnectionString,
  type FlagsClient,
  getDefaultFlagsClient,
} from './native-flags';
import { Reason } from './native-flags/types';
import { store } from './store';

export {
  createFlagsClient,
  EdgeConfigDataSource,
  type FlagsClient,
  getFlagsEnvironment,
  parseFlagsConnectionString,
  resetDefaultFlagsClient,
} from './native-flags';
export {
  type Comparator,
  type ConnectionOptions,
  type EnvironmentKey,
  type EvaluationParams,
  type EvaluationResult,
  type FlagKey,
  type Original,
  OutcomeType,
  type Packed,
  Reason,
  type SegmentId,
  type Value,
  type VariantId,
} from './native-flags/types';

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
      ? createFlagsClientFromConnectionString(connectionStringOrFlagsClient)
      : connectionStringOrFlagsClient;

  return function vercelAdapter<ValueType, EntitiesType>(): Adapter<
    ValueType,
    EntitiesType
  > {
    return {
      origin: {
        provider: 'vercel',
        projectId: flagsClient.connectionOptions.projectId,
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
