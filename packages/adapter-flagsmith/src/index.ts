import type { Adapter } from 'flags';
import flagsmith from 'flagsmith';
import { IIdentity, IInitConfig, IFlagsmithFeature } from 'flagsmith/types';

export type { IIdentity } from 'flagsmith/types';
export { getProviderData } from './provider';

let defaultFlagsmithAdapter: AdapterResponse | undefined;

export type FlagsmithValue = IFlagsmithFeature['value'];

export type EntitiesType = IIdentity;

export type AdapterResponse = {
  booleanValue: () => Adapter<boolean, EntitiesType>;
  stringValue: () => Adapter<string, EntitiesType>;
  numberValue: () => Adapter<number, EntitiesType>;
};

function createFlagsmithAdapter(params: IInitConfig): AdapterResponse {
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

        if (identity) {
          await flagsmith.identify(identity);
        }
        const state = flagsmith.getState();
        const flagState = state.flags?.[key];

        if (!flagState) {
          return defaultValue as boolean;
        }

        return flagState.enabled;
      },
    };
  }

  function stringValue(): Adapter<string, EntitiesType> {
    return {
      async decide({ key, defaultValue, entities: identity }): Promise<string> {
        await initialize();

        if (identity) {
          await flagsmith.identify(identity);
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

        if (identity) {
          await flagsmith.identify(identity);
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
  console.log('value', process.env);
  if (!value) {
    throw new Error(`Flagsmith Adapter: Missing ${name} environment variable`);
  }
  return value;
}

export const getOrCreateDefaultFlagsmithAdapter = () => {
  if (!defaultFlagsmithAdapter) {
    const environmentId = assertEnv('FLAGSMITH_ENVIRONMENT_ID');
    defaultFlagsmithAdapter = createFlagsmithAdapter({
      environmentID: environmentId,
    });
  }
  return defaultFlagsmithAdapter;
};

// Lazy default adapter
export const flagsmithAdapter: AdapterResponse =
  getOrCreateDefaultFlagsmithAdapter();
