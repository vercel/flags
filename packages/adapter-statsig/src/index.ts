export { getProviderData } from './provider';
import { Adapter } from '@vercel/flags';
import Statsig, {
  type StatsigUser,
  type StatsigOptions,
  type DynamicConfig,
} from 'statsig-node';

// Not exported in `statsig-node`
type FeatureGate = ReturnType<
  typeof Statsig.getFeatureGateWithExposureLoggingDisabledSync
>;

interface StatsigUserEntities {
  statsigUser: StatsigUser;
}

type AdapterResponse = {
  featureGate: <T>(
    getValue: (gate: FeatureGate) => T,
    opts?: { exposureLoggingDisabled?: boolean },
  ) => Adapter<T, StatsigUserEntities>;
  dynamicConfig: <T>(
    getValue: (config: DynamicConfig) => T,
    opts?: { exposureLoggingDisabled?: boolean },
  ) => Adapter<T, StatsigUserEntities>;
  initialize: () => Promise<void>;
};

const keyDelimiterRegex = /[\/\.,+:]/;

/**
 * Create a Statsig adapter for use with the Flags SDK.
 *
 * Can be used to define flags that are powered by Statsig's Feature Management
 * products including Feature Gates and Dynamic Configs.
 */
export function createStatsigAdapter(options: {
  /** The Statsig server API key */
  statsigServerApiKey: string;
  /** Optionally override Statsig initialization options */
  statsigOptions?: StatsigOptions;
  /** Provide the project ID to allow links to the Statsig console in the Vercel Toolbar */
  statsigProjectId?: string;
  /** Provide Edge Config details to use the optional Edge Config adapter */
  edgeConfig?: {
    connectionString: string;
    itemKey: string;
  };
}): AdapterResponse {
  const initializeStatsig = async (): Promise<void> => {
    // Peer dependency — Edge Config adapter requires `@vercel/edge-config` and `statsig-node-vercel`
    let dataAdapter: StatsigOptions['dataAdapter'] | undefined;
    if (options.edgeConfig) {
      const { EdgeConfigDataAdapter } = await import('statsig-node-vercel');
      const { createClient } = await import('@vercel/edge-config');
      dataAdapter = new EdgeConfigDataAdapter({
        edgeConfigItemKey: options.edgeConfig.itemKey,
        edgeConfigClient: createClient(options.edgeConfig.connectionString),
      });
    }

    await Statsig.initialize(options.statsigServerApiKey, {
      dataAdapter,
      // ID list syncing is disabled by default
      // Can be opted in using `options.statsigOptions`
      initStrategyForIDLists: 'none',
      disableIdListsSync: true,
      ...options.statsigOptions,
    });
  };
  let _initializePromise: Promise<void> | undefined;

  /**
   * Initialize the Statsig SDK.
   *
   * This must be called before checking gates/configs or logging events.
   * It is deduplicated to prevent multiple calls from being made.
   * You can pre-initialize the SDK by calling `adapter.initialize()`,
   * otherwise it will be initialized lazily when needed.
   */
  const initialize = async (): Promise<void> => {
    if (!_initializePromise) {
      _initializePromise = initializeStatsig();
    }
    await _initializePromise;
  };

  const isStatsigUser = (user: unknown): user is StatsigUser => {
    return user != null && typeof user === 'object';
  };

  /**
   * Resolve a flag powered by a Feature Gate.
   *
   * Implements `decide` to resolve the Feature Gate with `Statsig.getFeatureGateSync`
   *
   * If a function is provided, the return value of the function called
   * with the feature gate is returned.
   *
   * Implements `origin` to link to the flag in the Flags Explorer
   * if the adapter defines `statsigProjectId`
   */
  function featureGate<T>(
    getValue: (gate: FeatureGate) => T,
    opts?: {
      exposureLoggingDisabled?: boolean;
    },
  ): Adapter<T, StatsigUserEntities> {
    return {
      origin: options?.statsigProjectId
        ? (key) => {
            const keyPart = key.split(keyDelimiterRegex)[0] ?? '';
            return `https://console.statsig.com/${options.statsigProjectId}/gates/${keyPart}`;
          }
        : undefined,
      decide: async ({ key, entities }) => {
        await initialize();

        if (!isStatsigUser(entities?.statsigUser)) {
          throw new Error(
            'Invalid or missing statsigUser from identify. See https://flags-sdk.dev/concepts/identify',
          );
        }

        const gate = opts?.exposureLoggingDisabled
          ? Statsig.getFeatureGateWithExposureLoggingDisabledSync(
              entities?.statsigUser,
              key,
            )
          : Statsig.getFeatureGateSync(entities?.statsigUser, key);
        return getValue(gate);
      },
    };
  }

  /**
   * Resolve a flag powered by a Dynamic Config.
   *
   * Implements `decide` to resolve the Dynamic Config with `Statsig.getConfigSync`
   *
   * If a function is provided, the return value of the function called
   * with the dynamic config is returned.
   *
   * Implements `origin` to link to the flag in the Flags Explorer
   * if the adapter defines `statsigProjectId`
   */
  function dynamicConfig<T>(
    getValue: (config: DynamicConfig) => T,
    opts?: {
      exposureLoggingDisabled?: boolean;
    },
  ): Adapter<T, StatsigUserEntities> {
    return {
      origin: options.statsigProjectId
        ? (key) => {
            // If decide maps the same config in different ways,
            // The key can be differentiated. Ex. `config.param`
            const keyPart = key.split(keyDelimiterRegex)[0] ?? '';
            return `https://console.statsig.com/${options.statsigProjectId}/dynamic_configs/${keyPart}`;
          }
        : undefined,
      decide: async ({ key, entities }) => {
        await initialize();

        if (!isStatsigUser(entities?.statsigUser)) {
          throw new Error(
            'Invalid or missing statsigUser from identify. See https://flags-sdk.dev/concepts/identify',
          );
        }

        // .,+: are invalid characters for a Dynamic Config key
        // and flags may use them to represent the same config in different ways
        // Ex. flag `config.a` and flag `config.b`
        // In which case, we'll look up `config` and let the function decide how to compute `a` or `b`
        const keyParts = key.split(keyDelimiterRegex);
        let configKey = keyParts[0] ?? '';

        const config = opts?.exposureLoggingDisabled
          ? Statsig.getConfigWithExposureLoggingDisabledSync(
              entities?.statsigUser,
              configKey,
            )
          : Statsig.getConfigSync(entities?.statsigUser, configKey);

        return getValue(config);
      },
    };
  }

  return { featureGate, dynamicConfig, initialize };
}

let defaultStatsigAdapter: AdapterResponse | undefined;

export function resetDefaultStatsigAdapter() {
  defaultStatsigAdapter = undefined;
}

/**
 * Equivalent to `createStatsigAdapter` but with default environment variable names.
 *
 * Required:
 * - `STATSIG_SERVER_API_KEY` - Statsig secret server API key
 *
 * Optional:
 * - `STATSIG_PROJECT_ID` - Statsig project ID to enable link in Vercel's Flags Explorer
 * - `STATSIG_EDGE_CONFIG` - Vercel Edge Config connection string
 * - `STATSIG_EDGE_CONFIG_ITEM_KEY` - Vercel Edge Config item key
 */
export function createDefaultStatsigAdapter(): AdapterResponse {
  if (defaultStatsigAdapter) {
    return defaultStatsigAdapter;
  }
  const statsigServerApiKey = process.env.STATSIG_SERVER_API_KEY as string;
  const statsigProjectId = process.env.STATSIG_PROJECT_ID;
  // Edge Config is optional
  const edgeConfig = process.env.STATSIG_EDGE_CONFIG;
  const edgeConfigItemKey = process.env.STATSIG_EDGE_CONFIG_ITEM_KEY;
  if (!(edgeConfig && edgeConfigItemKey)) {
    defaultStatsigAdapter = createStatsigAdapter({
      statsigServerApiKey,
      statsigProjectId,
    });
  } else {
    defaultStatsigAdapter = createStatsigAdapter({
      statsigServerApiKey,
      edgeConfig: {
        connectionString: edgeConfig,
        itemKey: edgeConfigItemKey,
      },
      statsigProjectId,
    });
  }

  return defaultStatsigAdapter;
}

export const statsigAdapter: AdapterResponse = {
  featureGate: (...args) => createDefaultStatsigAdapter().featureGate(...args),
  dynamicConfig: (...args) =>
    createDefaultStatsigAdapter().dynamicConfig(...args),
  initialize: () => createDefaultStatsigAdapter().initialize(),
};
