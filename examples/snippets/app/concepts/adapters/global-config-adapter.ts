import { createClient, type GlobalConfigClient } from '@vercel/global-config';
import type { Adapter } from 'flags';

/**
 * An Global Config adapter for the Flags SDK
 */
export function createGlobalConfigAdapter(
  connectionString: string | GlobalConfigClient,
  options?: {
    globalConfigItemKey?: string;
    teamSlug?: string;
  },
) {
  if (!connectionString) {
    throw new Error('Global Config Adapter: Missing connection string');
  }
  const globalConfigClient =
    typeof connectionString === 'string'
      ? createClient(connectionString)
      : connectionString;

  const globalConfigItemKey = options?.globalConfigItemKey ?? 'flags';

  return function globalConfigAdapter<ValueType, EntitiesType>(): Adapter<
    ValueType,
    EntitiesType
  > {
    return {
      origin: options?.teamSlug
        ? `https://vercel.com/${options.teamSlug}/~/stores/edge-config/${globalConfigClient.connection.id}/items#item=${globalConfigItemKey}`
        : undefined,
      async decide({ key }): Promise<ValueType> {
        const definitions =
          await globalConfigClient.get<Record<string, boolean>>(
            globalConfigItemKey,
          );

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
        return definitions[key] as ValueType;
      },
    };
  };
}
