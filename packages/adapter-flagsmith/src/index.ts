import type { Adapter } from 'flags';
import flagsmith, { IFlagsmithFeature, IInitConfig } from 'flagsmith';

type AdapterParams = {
  key?: string;
} & IInitConfig;

export function createFlagsmithAdapter<
  ValueType extends IFlagsmithFeature,
  EntitiesType,
>({
  key: customKey,
  ...configParams
}: AdapterParams): Adapter<ValueType, EntitiesType> {
  async function initialize(config: IInitConfig) {
    if (flagsmith?.initialised) return;
    await flagsmith.init({ fetch: global.fetch, ...configParams });
  }

  return {
    async decide({
      key,
      entities,
      headers,
      cookies,
      defaultValue,
    }): Promise<ValueType> {
      await initialize(configParams);
      const state = flagsmith.getState();
      const keyName = customKey || key;
      const flag = state?.flags?.[keyName] ?? defaultValue;
      return flag as ValueType;
    },
  };
}

// Lazy default adapter
export const flagsmithAdapter = {
  getFeature: <ValueType extends IFlagsmithFeature>(params?: AdapterParams) => {
    const environmentID = process.env.FLAGSMITH_ENVIRONMENT_ID;
    if (!environmentID && params?.environmentID) {
      throw new Error(
        '@flags-sdk/flagsmith: FLAGSMITH_ENVIRONMENT_ID is not set',
      );
    }

    const adapter = createFlagsmithAdapter<ValueType, unknown>({
      environmentID,
      ...params,
    });

    return adapter;
  },
};
