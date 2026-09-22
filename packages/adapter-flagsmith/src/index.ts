import { type Flags, Flagsmith, type FlagsmithConfig } from '@flagsmith/nodejs';
import type { Adapter, ReadonlyHeaders } from 'flags';
import stringify from 'json-stable-stringify';
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
  const evaluations = new WeakMap<
    ReadonlyHeaders,
    Map<string, Promise<Flags>>
  >();

  function getFlags(headers: ReadonlyHeaders, entities?: EntitiesType) {
    const identity = entities?.targetingKey ? entities : undefined;
    const key = identity
      ? stringify([identity.targetingKey, identity.traits ?? {}])!
      : '';
    let requestEvaluations = evaluations.get(headers);
    if (!requestEvaluations) {
      requestEvaluations = new Map();
      evaluations.set(headers, requestEvaluations);
    }
    let result = requestEvaluations.get(key);
    if (!result) {
      result = Promise.resolve().then(() => {
        if (!client) {
          client = new Flagsmith({
            ...params,
            enableLocalEvaluation: params.enableLocalEvaluation ?? true,
          });
        }
        return identity
          ? client.getIdentityFlags(identity.targetingKey, identity.traits)
          : client.getEnvironmentFlags();
      });
      requestEvaluations.set(key, result);
    }
    return result;
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
    return {
      async decide({
        key,
        defaultValue,
        entities: identity,
        headers,
      }): Promise<CoercedType<T>> {
        const flags = await getFlags(headers, identity);
        const flagState = flags.getFlag(key);
        const isFlagDisabled = !flagState || !flagState.enabled;

        if (isFlagDisabled) {
          return defaultValue as CoercedType<T>;
        }

        const value = flagState.value;
        const isEmpty = value === null || value === undefined || value === '';

        if (isEmpty) {
          return defaultValue as CoercedType<T>;
        }

        if (!options?.coerce) {
          return value as CoercedType<T>;
        }

        const coercedValue = coerceValue(value, options.coerce);

        if (coercedValue === undefined && options.coerce === 'boolean') {
          return flagState.enabled as CoercedType<T>;
        }

        if (coercedValue === undefined) {
          return defaultValue as CoercedType<T>;
        }

        return coercedValue as CoercedType<T>;
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
