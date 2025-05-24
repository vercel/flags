import type { Adapter } from 'flags';
import flagsmith from 'flagsmith';
import { IIdentity, IInitConfig, IFlagsmithFeature } from 'flagsmith/types';

export { getProviderData } from './provider';

let defaultFlagsmithAdapter:
  | ReturnType<typeof createFlagsmithAdapter>
  | undefined;

export type FlagsmithValue = IFlagsmithFeature['value'];

export function createFlagsmithAdapter<
  ValueType extends FlagsmithValue,
  EntitiesType extends IIdentity,
>(params: IInitConfig): Adapter<ValueType, EntitiesType> {
  return {
    async decide({
      key,
      defaultValue,
      entities,
    }: {
      key: string;
      defaultValue?: ValueType;
      entities?: EntitiesType;
      headers: any;
      cookies: any;
    }): Promise<ValueType> {
      await flagsmith.init({ fetch: globalThis.fetch, ...params });
      const identity = entities?.[0];

      if (identity) {
        await flagsmith.identify(identity);
      }
      const state = flagsmith.getState();
      const flagState = state.flags?.[key];

      if (!flagState || !flagState?.enabled) {
        return defaultValue as ValueType;
      }

      return flagState.value as ValueType;
    },
  };
}

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Flagsmith Adapter: Missing ${name} environment variable`);
  }
  return value;
}

export const getOrCreateDefaultFlagsmithAdapter = () => {
  if (!defaultFlagsmithAdapter) {
    const environmentID = assertEnv('FLAGSMITH_ENVIRONMENT_ID');
    defaultFlagsmithAdapter = createFlagsmithAdapter({
      environmentID,
    });
  }
  return defaultFlagsmithAdapter;
};

// Lazy default adapter
export const flagsmithAdapter = {
  getFeatureValue() {
    return getOrCreateDefaultFlagsmithAdapter();
  },
};
