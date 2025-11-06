import type { Adapter } from 'flags';
import flagsmith from 'flagsmith';
import type { IFlagsmithFeature, IInitConfig } from 'flagsmith/types';
import {
  type CoercedType,
  type CoerceOption,
  coerceValue,
} from './type-coercion';

export { getProviderData } from './provider';

let defaultFlagsmithAdapter: AdapterResponse | undefined;

export type FlagsmithValue = IFlagsmithFeature['value'];

export type EntitiesType = {
  targetingKey: string;
  traits: Record<string, string | number | boolean | null>;
};

export type AdapterResponse = {
  getValue: <T extends CoerceOption | undefined = undefined>(options?: {
    coerce?: T;
  }) => Adapter<CoercedType<T>, EntitiesType>;
};

export function createFlagsmithAdapter(params: IInitConfig): AdapterResponse {
  async function initialize() {
    await flagsmith.init({ fetch: globalThis.fetch, ...params });
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
      }): Promise<CoercedType<T>> {
        await initialize();

        if (identity?.targetingKey) {
          const { targetingKey, traits } = identity;
          await flagsmith.identify(targetingKey, traits);
        }

        const state = flagsmith.getState();
        const flagState = state.flags?.[key];
        const isFlagDisabled = !flagState || !flagState.enabled;

        if (isFlagDisabled) {
          return defaultValue as CoercedType<T>;
        }

        const isEmpty =
          flagState.value === null ||
          flagState.value === undefined ||
          flagState.value === '';

        if (isEmpty) {
          return defaultValue as CoercedType<T>;
        }

        if (!options?.coerce) {
          return flagState.value as CoercedType<T>;
        }

        const coercedValue = coerceValue(flagState.value, options.coerce);

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
    const environmentId = assertEnv('FLAGSMITH_ENVIRONMENT_ID');
    defaultFlagsmithAdapter = createFlagsmithAdapter({
      environmentID: environmentId,
    });
  }
  return defaultFlagsmithAdapter;
};

// Lazy default adapter
export const flagsmithAdapter: AdapterResponse = {
  getValue: <T extends CoerceOption | undefined = undefined>(options?: {
    coerce?: T;
  }) => getOrCreateDefaultFlagsmithAdapter().getValue(options),
};
