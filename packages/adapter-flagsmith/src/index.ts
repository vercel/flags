import type { Adapter } from 'flags';
import flagsmith, { IFlagsmithFeature, IInitConfig } from 'flagsmith';

export function createFlagsmithAdapter<
  ValueType extends IFlagsmithFeature,
  EntitiesType,
>(config: IInitConfig): Adapter<ValueType, EntitiesType> {
  async function initialize(config: IInitConfig) {
    if (flagsmith?.initialised) return;
    await flagsmith.init({ fetch: global.fetch, ...config });
  }

  return {
    async decide({
      key,
      entities,
      headers,
      cookies,
      defaultValue,
    }): Promise<ValueType> {
      await initialize(config);
      const state = flagsmith.getState();
      const flag = state?.flags?.[key] ?? defaultValue;

      return flag as ValueType;
    },
  };
}
