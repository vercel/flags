import type { Adapter } from '@vercel/flags';
import { createClient, type EdgeConfigClient } from '@vercel/edge-config';

/**
 * Allows creating a custom Edge Config adapter for feature flags
 */
export function createEdgeConfigAdapter(
  connectionString: string | EdgeConfigClient,
  options?: {
    edgeConfigItemKey?: string;
    teamSlug?: string;
  },
) {
  if (!connectionString) {
    throw new Error('Edge Config Adapter: Missing connection string');
  }
  const edgeConfigClient =
    typeof connectionString === 'string'
      ? createClient(connectionString)
      : connectionString;

  const edgeConfigItemKey = options?.edgeConfigItemKey ?? 'flags';

  return function edgeConfigAdapter<ValueType, EntitiesType>(): Adapter<
    ValueType,
    EntitiesType
  > {
    return {
      origin: options?.teamSlug
        ? `https://vercel.com/${options.teamSlug}/~/stores/edge-config/${edgeConfigClient.connection.id}/items#item=${edgeConfigItemKey}`
        : undefined,
      async decide({ key }): Promise<ValueType> {
        const definitions =
          await edgeConfigClient.get<Record<string, boolean>>(
            edgeConfigItemKey,
          );

        // if a defaultValue was provided this error will be caught and the defaultValue will be used
        if (!definitions) {
          throw new Error(
            `Edge Config Adapter: Edge Config item "${edgeConfigItemKey}" not found`,
          );
        }

        // if a defaultValue was provided this error will be caught and the defaultValue will be used
        if (!(key in definitions)) {
          throw new Error(
            `Edge Config Adapter: Flag "${key}" not found in Edge Config item "${edgeConfigItemKey}"`,
          );
        }
        return definitions[key] as ValueType;
      },
    };
  };
}
