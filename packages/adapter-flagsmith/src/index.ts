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
  booleanValue: () => Adapter<boolean, EntitiesType>;
  stringValue: () => Adapter<string, EntitiesType>;
  numberValue: () => Adapter<number, EntitiesType>;
  getValue: <T extends CoerceOption | undefined = undefined>(options?: {
    coerce?: T;
  }) => Adapter<CoercedType<T>, EntitiesType>;
};

export function createFlagsmithAdapter(params: IInitConfig): AdapterResponse {
  async function initialize() {
    await flagsmith.init({ fetch: globalThis.fetch, ...params });
  }

  function booleanValue(): Adapter<boolean, EntitiesType> {
    return {
      async decide({
        key,
        defaultValue,
        entities: identity,
      }): Promise<boolean> {
        await initialize();

        if (identity?.targetingKey) {
          const { targetingKey, traits } = identity;
          await flagsmith.identify(targetingKey, traits);
        }

        const state = flagsmith.getState();
        const flagState = state.flags?.[key];
        const isFlagDisabled = !flagState || !flagState.enabled;

        if (isFlagDisabled) {
          return defaultValue as boolean;
        }

        if (typeof flagState.value === 'boolean') {
          return flagState.value;
        }

        if (['true', 'false'].includes(flagState.value as string)) {
          return flagState.value === 'true';
        }

        return flagState.enabled;
      },
    };
  }

  function stringValue(): Adapter<string, EntitiesType> {
    return {
      async decide({ key, defaultValue, entities: identity }): Promise<string> {
        await initialize();

        if (identity?.targetingKey) {
          const { targetingKey, traits } = identity;
          await flagsmith.identify(targetingKey, traits);
        }

        const state = flagsmith.getState();
        const flagState = state.flags?.[key];
        const isFlagDisabled = !flagState || !flagState.enabled;
        const isEmpty =
          flagState &&
          (flagState.value === null ||
            flagState.value === undefined ||
            flagState.value === '');

        if (isFlagDisabled || isEmpty) {
          return defaultValue as string;
        }

        return flagState.value as string;
      },
    };
  }

  function numberValue(): Adapter<number, EntitiesType> {
    return {
      async decide({ key, defaultValue, entities: identity }): Promise<number> {
        await initialize();

        if (identity?.targetingKey) {
          const { targetingKey, traits } = identity;
          await flagsmith.identify(targetingKey, traits);
        }

        const state = flagsmith.getState();
        const flagState = state.flags?.[key];
        const isFlagDisabled = !flagState || !flagState.enabled;
        const isEmpty =
          flagState &&
          (flagState.value === null ||
            flagState.value === undefined ||
            flagState.value === '');

        if (isFlagDisabled || isEmpty) {
          return defaultValue as number;
        }

        return flagState.value as number;
      },
    };
  }

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
        const isEmpty =
          flagState &&
          (flagState.value === null ||
            flagState.value === undefined ||
            flagState.value === '');

        if (isFlagDisabled || isEmpty) {
          return defaultValue as CoercedType<T>;
        }

        // Without coercion, return raw value
        if (!options?.coerce) {
          return flagState.value as CoercedType<T>;
        }

        // With coercion, attempt to coerce the value
        const coercedValue = coerceValue(flagState.value, options.coerce);

        // Return default value if coercion failed
        if (coercedValue === undefined) {
          return defaultValue as CoercedType<T>;
        }

        return coercedValue as CoercedType<T>;
      },
    };
  }

  return {
    booleanValue,
    stringValue,
    numberValue,
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
  booleanValue: () => getOrCreateDefaultFlagsmithAdapter().booleanValue(),
  stringValue: () => getOrCreateDefaultFlagsmithAdapter().stringValue(),
  numberValue: () => getOrCreateDefaultFlagsmithAdapter().numberValue(),
  getValue: <T extends CoerceOption | undefined = undefined>(options?: {
    coerce?: T;
  }) => getOrCreateDefaultFlagsmithAdapter().getValue(options),
};
