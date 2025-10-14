import type { Adapter } from 'flags';
import flagsmith from 'flagsmith';
import { IInitConfig, IFlagsmithFeature } from 'flagsmith/types';

export type { IIdentity } from 'flagsmith/types';
export { getProviderData } from './provider';

let defaultFlagsmithAdapter: AdapterResponse | undefined;

export type FlagsmithValue = IFlagsmithFeature['value'];

export type EntitiesType = {
  targetingKey: string;
} & Record<string, string | number | boolean | null>;

export type AdapterResponse = {
  booleanValue: () => Adapter<boolean, EntitiesType>;
  stringValue: () => Adapter<string, EntitiesType>;
  numberValue: () => Adapter<number, EntitiesType>;
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
          const { targetingKey, ...traits } = identity;
          await flagsmith.identify(identity.targetingKey, {
            ...traits,
          });
        }
        const state = flagsmith.getState();
        const flagState = state.flags?.[key];

        if (!flagState) {
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
          const { targetingKey, ...traits } = identity;
          await flagsmith.identify(identity.targetingKey, {
            ...traits,
          });
        }

        const state = flagsmith.getState();
        const flagState = state.flags?.[key];

        if (!flagState || !flagState.enabled) {
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
          const { targetingKey, ...traits } = identity;
          await flagsmith.identify(identity.targetingKey, {
            ...traits,
          });
        }

        const state = flagsmith.getState();
        const flagState = state.flags?.[key];

        if (!flagState || !flagState.enabled) {
          return defaultValue as number;
        }

        return flagState.value as number;
      },
    };
  }

  return {
    booleanValue,
    stringValue,
    numberValue,
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
};
