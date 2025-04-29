import type { Adapter } from 'flags';
import flagsmith, {
  IFlagsmithFeature,
  IInitConfig,
  IIdentity,
  createFlagsmithInstance,
} from 'flagsmith';

type AdapterParams = {
  key?: string;
  projectID?: string;
  dashboardURL?: string;
} & IInitConfig;

export function createFlagsmithAdapter<
  ValueType extends IFlagsmithFeature,
  EntitiesType extends IIdentity,
>({
  key: customKey,
  environmentID,
  projectID,
  dashboardURL,
  ...configParams
}: AdapterParams): Adapter<ValueType, EntitiesType> {
  async function initialize() {
    const { identity, ...restConfigParams } = configParams;
    const flagsmithInstance = createFlagsmithInstance();
    await flagsmithInstance.init({ fetch: global.fetch, ...restConfigParams });
    return flagsmithInstance;
  }

  return {
    origin: (key: string) => {
      const state = flagsmith.getState();
      const flag = state?.flags?.[key];
      return `${dashboardURL}/project/${projectID}/environment/${environmentID}/features/?feature=${flag?.id}`;
    },
    async decide({
      key,
      entities,
      headers,
      cookies,
      defaultValue,
    }): Promise<ValueType> {
      const identity = entities;
      const flagsmithInstance = await initialize();
      const state = flagsmithInstance.getState();

      flagsmithInstance.setState({
        ...state,
        evaluationContext: {
          identity,
        },
      });

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
    const dashboardURL = process.env.FLAGSMITH_DASHBOARD_URL;
    const projectID = process.env.FLAGSMITH_PROJECT_ID;
    if (!environmentID && params?.environmentID) {
      throw new Error(
        '@flags-sdk/flagsmith: FLAGSMITH_ENVIRONMENT_ID is not set',
      );
    }

    const adapter = createFlagsmithAdapter<ValueType, IIdentity>({
      environmentID,
      dashboardURL,
      projectID,
      ...params,
    });

    return adapter;
  },
};
