import { createClient, type GlobalConfigClient } from '@vercel/global-config';
import type { Adapter, ReadonlyHeaders } from 'flags';

export type GlobalConfigFlags = {
  [key: string]: boolean | number | string | null;
};

// extend the adapter definition to expose a default adapter
let defaultGlobalConfigAdapter:
  | ReturnType<typeof createGlobalConfigAdapter>
  | undefined;

/**
 * A default Vercel adapter for Global Config
 *
 */
export function globalConfigAdapter<ValueType, EntitiesType>(): Adapter<
  ValueType,
  EntitiesType
> {
  // Initialized lazily to avoid warning when it is not actually used and env vars are missing.
  if (!defaultGlobalConfigAdapter) {
    if (!process.env.GLOBAL_CONFIG) {
      throw new Error(
        '@flags-sdk/global-config: Missing GLOBAL_CONFIG env var',
      );
    }

    defaultGlobalConfigAdapter = createGlobalConfigAdapter(
      process.env.GLOBAL_CONFIG,
    );
  }

  return defaultGlobalConfigAdapter<ValueType, EntitiesType>();
}

export function resetDefaultGlobalConfigAdapter() {
  defaultGlobalConfigAdapter = undefined;
}

type GlobalConfigItem = Record<string, boolean>;

/**
 * Allows creating a custom Global Config adapter for feature flags
 */
export function createGlobalConfigAdapter(
  connectionString: string | GlobalConfigClient,
  options?: {
    globalConfigItemKey?: string;
    teamSlug?: string;
  },
) {
  if (!connectionString) {
    throw new Error('@flags-sdk/global-config: Missing connection string');
  }
  const globalConfigClient =
    typeof connectionString === 'string'
      ? createClient(connectionString)
      : connectionString;

  const globalConfigItemKey = options?.globalConfigItemKey ?? 'flags';

  /**
   * Per-request cache to ensure we only ever read Global Config once per request.
   * Uses the request headers reference as the cache key.
   *
   * ReadonlyHeaders -> Promise<GlobalConfigItem>
   */
  const globalConfigItemCache = new WeakMap<
    ReadonlyHeaders,
    Promise<GlobalConfigItem | undefined>
  >();

  const adapterId = Symbol('globalConfigAdapter');

  async function getDefinitions(
    headers: ReadonlyHeaders,
  ): Promise<GlobalConfigItem | undefined> {
    const cached = globalConfigItemCache.get(headers);
    if (cached) return cached;
    const valuePromise =
      globalConfigClient.get<GlobalConfigItem>(globalConfigItemKey);
    globalConfigItemCache.set(headers, valuePromise);
    return valuePromise;
  }

  const adapter: Adapter<unknown, unknown> = {
    adapterId,
    origin: options?.teamSlug
      ? `https://vercel.com/${options.teamSlug}/~/stores/global-config/${globalConfigClient.connection.id}/items#item=${globalConfigItemKey}`
      : undefined,
    async decide({ key, headers }): Promise<unknown> {
      const definitions = await getDefinitions(headers);

      // if a defaultValue was provided this error will be caught and the defaultValue will be used
      if (!definitions) {
        throw new Error(
          `@flags-sdk/global-config: Global Config item "${globalConfigItemKey}" not found`,
        );
      }

      // if a defaultValue was provided this error will be caught and the defaultValue will be used
      if (!(key in definitions)) {
        throw new Error(
          `@flags-sdk/global-config: Flag "${key}" not found in Global Config item "${globalConfigItemKey}"`,
        );
      }
      return definitions[key];
    },
    async bulkDecide({ flags, headers }): Promise<Record<string, unknown>> {
      const definitions = await getDefinitions(headers);

      if (!definitions) {
        throw new Error(
          `@flags-sdk/global-config: Global Config item "${globalConfigItemKey}" not found`,
        );
      }

      const out: Record<string, unknown> = {};
      for (const { key } of flags) {
        if (key in definitions) {
          out[key] = definitions[key];
        }
      }
      return out;
    },
  };

  return function globalConfigAdapter<ValueType, EntitiesType>(): Adapter<
    ValueType,
    EntitiesType
  > {
    return adapter as Adapter<ValueType, EntitiesType>;
  };
}
