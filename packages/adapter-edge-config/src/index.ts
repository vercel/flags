import type { Adapter } from '@vercel/flags';
import { createClient, type EdgeConfigClient } from '@vercel/edge-config';

export type EdgeConfigFlags = {
  [key: string]: boolean | number | string | null;
};

// extend the adapter definition to expose a default adapter
let defaultEdgeConfigAdapter:
  | ReturnType<typeof createEdgeConfigAdapter>
  | undefined;

/**
 * A default Vercel adapter for Edge Config
 *
 */
export function edgeConfigAdapter<ValueType, EntitiesType>(): Adapter<
  ValueType,
  EntitiesType
> {
  // Initialized lazily to avoid warning when it is not actually used and env vars are missing.
  if (!defaultEdgeConfigAdapter) {
    if (!process.env.EDGE_CONFIG) {
      throw new Error('Edge Config Adapter: Missing EDGE_CONFIG env var');
    }

    defaultEdgeConfigAdapter = createEdgeConfigAdapter(process.env.EDGE_CONFIG);
  }

  return defaultEdgeConfigAdapter<ValueType, EntitiesType>();
}

export function resetDefaultEdgeConfigAdapter() {
  defaultEdgeConfigAdapter = undefined;
}

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
