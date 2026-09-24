import { type Flags, Flagsmith, type FlagsmithConfig } from '@flagsmith/nodejs';
import type { Adapter } from 'flags';
import {
  type CoercedType,
  type CoerceOption,
  coerceValue,
} from './type-coercion';

export { getProviderData } from './provider';

let defaultFlagsmithAdapter: AdapterResponse | undefined;

export type { FlagsmithConfig, FlagsmithValue } from '@flagsmith/nodejs';

export type EntitiesType = {
  targetingKey: string;
  traits: Record<string, string | number | boolean | null>;
};

export type AdapterResponse = {
  /** Stop the shared client's environment polling when shutting down. */
  close: () => Promise<void>;
  getValue: <T extends CoerceOption | undefined = undefined>(options?: {
    coerce?: T;
  }) => Adapter<CoercedType<T>, EntitiesType>;
};

export function createFlagsmithAdapter(
  params: FlagsmithConfig,
): AdapterResponse {
  // The server SDK keeps environment data on the client, not a current user.
  // Construct lazily so imports and builds do not start background polling.
  let client: Flagsmith | undefined;
  // The bulk hook uses the first adapter in each group, so each coercion
  // mode needs its own identity while sharing the underlying client.
  const adapterIds = new Map<CoerceOption | undefined, symbol>();

  function getFlags(entities?: EntitiesType): Promise<Flags> {
    client ??= new Flagsmith({
      ...params,
      enableLocalEvaluation: params.enableLocalEvaluation ?? false,
    });
    return entities?.targetingKey
      ? client.getIdentityFlags(entities.targetingKey, entities.traits)
      : client.getEnvironmentFlags();
  }

  /**
   * Returns an adapter for flag evaluation with optional type coercion.
   *
   * @param options - Configuration options
   * @param options.coerce - Optional type coercion: "string", "number", or "boolean"
   *
   * @returns An adapter that evaluates flags based on the coercion option
   *
   * @remarks
   * Behavior varies based on coercion option:
   * - No coercion: Returns raw value from Flagsmith
   * - "string": Converts values to string
   * - "number": Converts values to number
   * - "boolean": Converts values to boolean, falls back to flag's enabled state if coercion fails
   *
   * Returns default value when:
   * - Flag is disabled
   * - Value is null, undefined, or empty string
   * - Coercion fails (except boolean coercion, which falls back to enabled state)
   */
  function getValue<T extends CoerceOption | undefined = undefined>(options?: {
    coerce?: T;
  }): Adapter<CoercedType<T>, EntitiesType> {
    const coerce = options?.coerce;
    let adapterId = adapterIds.get(coerce);
    if (!adapterId) {
      adapterId = Symbol('flagsmithAdapter');
      adapterIds.set(coerce, adapterId);
    }

    function readValue(
      flags: Flags,
      key: string,
      defaultValue: unknown,
    ): CoercedType<T> {
      const flagState = flags.getFlag(key);
      if (!flagState?.enabled) return defaultValue as CoercedType<T>;
      const value = flagState.value;
      if (value === null || value === undefined || value === '') {
        return defaultValue as CoercedType<T>;
      }
      if (!coerce) return value as CoercedType<T>;
      const coercedValue = coerceValue(value, coerce);
      if (coercedValue === undefined && coerce === 'boolean') {
        return flagState.enabled as CoercedType<T>;
      }
      return (
        coercedValue === undefined ? defaultValue : coercedValue
      ) as CoercedType<T>;
    }

    return {
      adapterId,
      async decide({ key, defaultValue, entities }) {
        return readValue(await getFlags(entities), key, defaultValue);
      },
      async bulkDecide({ flags, entities }) {
        const values = await getFlags(entities);
        return Object.fromEntries(
          flags.map(({ key, defaultValue }) => [
            key,
            readValue(values, key, defaultValue),
          ]),
        );
      },
    };
  }

  return {
    close: async () => {
      await client?.close();
    },
    getValue,
  };
}

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Flagsmith Adapter: Missing ${name} environment variable`);
  }
  return value;
}

const getOrCreateDefaultFlagsmithAdapter = () => {
  if (!defaultFlagsmithAdapter) {
    const environmentKey = assertEnv('FLAGSMITH_ENVIRONMENT_KEY');
    defaultFlagsmithAdapter = createFlagsmithAdapter({
      environmentKey,
    });
  }
  return defaultFlagsmithAdapter;
};

// Lazy default adapter
export const flagsmithAdapter: AdapterResponse = {
  close: async () => {
    await defaultFlagsmithAdapter?.close();
  },
  getValue: <T extends CoerceOption | undefined = undefined>(options?: {
    coerce?: T;
  }) => getOrCreateDefaultFlagsmithAdapter().getValue(options),
};
