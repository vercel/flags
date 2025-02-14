import type { Adapter, ReadonlyHeaders } from '@vercel/flags';
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
      throw new Error('@flags-sdk/edge-config: Missing EDGE_CONFIG env var');
    }

    defaultEdgeConfigAdapter = createEdgeConfigAdapter(process.env.EDGE_CONFIG);
  }

  return defaultEdgeConfigAdapter<ValueType, EntitiesType>();
}

export function resetDefaultEdgeConfigAdapter() {
  defaultEdgeConfigAdapter = undefined;
}

type EdgeConfigItem = Record<string, boolean>;

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
    throw new Error('@flags-sdk/edge-config: Missing connection string');
  }
  const edgeConfigClient =
    typeof connectionString === 'string'
      ? createClient(connectionString)
      : connectionString;

  const edgeConfigItemKey = options?.edgeConfigItemKey ?? 'flags';

  /**
   * Per-request cache to ensure we only ever read Edge Config once per request.
   * Uses the request headers reference as the cache key.
   *
   * ReadonlyHeaders -> Promise<EdgeConfigItem>
   */
  const edgeConfigItemCache = new WeakMap<
    ReadonlyHeaders,
    Promise<EdgeConfigItem | undefined>
  >();

  return function edgeConfigAdapter<ValueType, EntitiesType>(): Adapter<
    ValueType,
    EntitiesType
  > {
    return {
      origin: options?.teamSlug
        ? `https://vercel.com/${options.teamSlug}/~/stores/edge-config/${edgeConfigClient.connection.id}/items#item=${edgeConfigItemKey}`
        : undefined,
      async decide({ key, headers }): Promise<ValueType> {
        const cached = edgeConfigItemCache.get(headers);
        let valuePromise: Promise<EdgeConfigItem | undefined>;

        if (!cached) {
          valuePromise =
            edgeConfigClient.get<EdgeConfigItem>(edgeConfigItemKey);
          edgeConfigItemCache.set(headers, valuePromise);
        } else {
          valuePromise = cached;
        }

        const definitions = await valuePromise;

        // if a defaultValue was provided this error will be caught and the defaultValue will be used
        if (!definitions) {
          throw new Error(
            `@flags-sdk/edge-config: Edge Config item "${edgeConfigItemKey}" not found`,
          );
        }

        // if a defaultValue was provided this error will be caught and the defaultValue will be used
        if (!(key in definitions)) {
          throw new Error(
            `@flags-sdk/edge-config: Flag "${key}" not found in Edge Config item "${edgeConfigItemKey}"`,
          );
        }
        return definitions[key] as ValueType;
      },
    };
  };
}
