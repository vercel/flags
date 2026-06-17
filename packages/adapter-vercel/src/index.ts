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
  sdkKeyOrFlagsClient?: string | FlagsClient,
) {
  const flagsClient =
    typeof sdkKeyOrFlagsClient === 'string' || sdkKeyOrFlagsClient === undefined
      ? createClient(sdkKeyOrFlagsClient)
      : sdkKeyOrFlagsClient;

  // Stable identity for this adapter's underlying flagsClient. Captured in
  // the closure so every adapter object the factory below returns shares it,
  // letting `evaluate()` group flags from multiple `vercelAdapter()` calls
  // into a single `bulkDecide` invocation.
  const adapterId = Symbol('vercelAdapter');

  const adapter: Adapter<unknown, unknown> = {
    adapterId,
    origin: flagsClient.origin,
    config: { reportValue: false },
    async decide({ key, entities }) {
      const evaluationResult = await flagsClient.evaluate<unknown, unknown>(
        key,
        undefined,
        entities,
      );

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
    async bulkDecide({ flags, entities }) {
      // `flags` is typed `{ key: string; defaultValue?: unknown }[]` on
      // `Adapter.bulkDecide` (to keep `ValueType` covariant). The client
      // here narrows it back to `ValueType`; `defaultValue` is shuttled
      // through opaquely so the cast is safe.
      const results = await flagsClient.bulkEvaluate<unknown, unknown>(
        flags as { key: string; defaultValue?: unknown }[],
        entities,
      );
      const out: Record<string, unknown> = {};
      for (const key in results) {
        const r = results[key]!;
        // Omit undefined so the SDK applies the per-flag `defaultValue`
        // fallback (matches single-decide semantics).
        if (r.value !== undefined) out[key] = r.value;
      }
      return out;
    },
  };

  return function vercelAdapter<ValueType, EntitiesType>(): Adapter<
    ValueType,
    EntitiesType
  > {
    return adapter as Adapter<ValueType, EntitiesType>;
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

const flagsClients = new Map<string | undefined, FlagsClient>();

/**
 * Ensures we only ever create a single client per SDK Key
 * When undefined is passed, due to OIDC being used, then we return a single client too.
 **/
function getOrCreateClient(sdkKey?: string): FlagsClient {
  let client = flagsClients.get(sdkKey);
  if (!client) {
    client = createClient(sdkKey);
    flagsClients.set(sdkKey, client);
  }
  return client;
}

function isVercelOrigin(
  origin: unknown,
): origin is { provider: 'vercel'; sdkKey?: string } {
  return (
    typeof origin === 'object' &&
    origin !== null &&
    'provider' in origin &&
    (origin as Record<string, unknown>).provider === 'vercel'
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
  const sdkKeys = new Set<string | undefined>();
  for (const d of flagDefs) {
    if (isVercelOrigin(d.origin)) {
      sdkKeys.add(d.origin.sdkKey);
    }
  }

  const projectIdBySdkKey = new Map<string | undefined, string>();
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
