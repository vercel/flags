export { getProviderData } from './provider';
import type { Adapter } from 'flags';
import Statsig, {
  type StatsigUser,
  type StatsigOptions,
  type DynamicConfig,
  type Layer,
} from 'statsig-node-lite';
import {
  createEdgeConfigDataAdapter,
  createSyncingHandler,
} from './edge-runtime-hooks';

// Export the Statsig instance
export {
  Statsig,
  type StatsigUser,
  type StatsigOptions,
  type DynamicConfig,
  type Layer,
};

export type FeatureGate = ReturnType<
  typeof Statsig.getFeatureGateWithExposureLoggingDisabledSync
>;

type AdapterFunction<O> = <T>(
  getValue: (obj: O) => T,
  opts?: { exposureLogging?: boolean },
) => Adapter<T, StatsigUser>;

type AdapterResponse = {
  featureGate: AdapterFunction<FeatureGate>;
  dynamicConfig: AdapterFunction<DynamicConfig>;
  experiment: AdapterFunction<DynamicConfig>;
  autotune: AdapterFunction<DynamicConfig>;
  layer: AdapterFunction<Layer>;
  initialize: () => Promise<typeof Statsig>;
};

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
    let dataAdapter: StatsigOptions['dataAdapter'] | undefined;
    if (options.edgeConfig) {
      dataAdapter = await createEdgeConfigDataAdapter({
        edgeConfigItemKey: options.edgeConfig.itemKey,
        edgeConfigConnectionString: options.edgeConfig.connectionString,
      });
    }

    await Statsig.initialize(options.statsigServerApiKey, {
      dataAdapter,
      // ID list syncing is disabled by default
      // Can be opted in using `options.statsigOptions`
      initStrategyForIDLists: 'none',
      disableIdListsSync: true,
      // Set a shorter interval during development so developers see changes earlier
      rulesetsSyncIntervalMs:
        process.env.NODE_ENV === 'development' ? 5_000 : undefined,
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
  const initialize = async (): Promise<typeof Statsig> => {
    if (!_initializePromise) {
      _initializePromise = initializeStatsig();
    }
    await _initializePromise;
    return Statsig;
  };

  const isStatsigUser = (user: unknown): user is StatsigUser => {
    return user != null && typeof user === 'object';
  };

  const syncHandler = createSyncingHandler();

  async function predecide(user?: StatsigUser): Promise<StatsigUser> {
    await initialize();
    syncHandler?.();
    if (!isStatsigUser(user)) {
      throw new Error(
        '@flags-sdk/statsig: Invalid or missing statsigUser from identify. See https://flags-sdk.dev/concepts/identify',
      );
    }
    return user;
  }

  function origin(prefix: string) {
    if (!options.statsigProjectId) {
      return () => undefined;
    }
    return (key: string) => {
      // Allow unused suffix to be provided to flags to tell them apart.
      // Used for different treatments of the same Statsig entities.
      const keyPart = key.split('.')[0] ?? '';
      return `https://console.statsig.com/${options.statsigProjectId}/${prefix}/${keyPart}`;
    };
  }

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
      exposureLogging?: boolean;
    },
  ): Adapter<T, StatsigUser> {
    return {
      origin: origin('gates'),
      decide: async ({ key, entities }) => {
        const user = await predecide(entities);
        const gate = opts?.exposureLogging
          ? Statsig.getFeatureGateSync(user, key)
          : Statsig.getFeatureGateWithExposureLoggingDisabledSync(user, key);
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
      exposureLogging?: boolean;
    },
  ): Adapter<T, StatsigUser> {
    return {
      origin: origin('dynamic_configs'),
      decide: async ({ key, entities }) => {
        const user = await predecide(entities);
        const configKey = key.split('.')[0] ?? '';
        const config = opts?.exposureLogging
          ? Statsig.getConfigSync(user, configKey)
          : Statsig.getConfigWithExposureLoggingDisabledSync(user, configKey);
        return getValue(config);
      },
    };
  }

  function experiment<T>(
    getValue: (experiment: DynamicConfig) => T,
    opts?: { exposureLogging?: boolean },
  ): Adapter<T, StatsigUser> {
    return {
      origin: origin('experiments'),
      decide: async ({ key, entities }) => {
        const user = await predecide(entities);
        const experiment = opts?.exposureLogging
          ? Statsig.getExperimentSync(user, key)
          : Statsig.getExperimentWithExposureLoggingDisabledSync(user, key);
        return getValue(experiment);
      },
    };
  }

  function autotune<T>(
    getValue: (autotune: DynamicConfig) => T,
    opts?: { exposureLogging?: boolean },
  ): Adapter<T, StatsigUser> {
    return {
      origin: origin('autotune'),
      decide: async ({ key, entities }) => {
        const user = await predecide(entities);
        const autotune = opts?.exposureLogging
          ? Statsig.getConfigSync(user, key)
          : Statsig.getConfigWithExposureLoggingDisabledSync(user, key);
        return getValue(autotune);
      },
    };
  }

  function layer<T>(
    getValue: (layer: Layer) => T,
    opts?: { exposureLogging?: boolean },
  ): Adapter<T, StatsigUser> {
    return {
      origin: origin('layers'),
      decide: async ({ key, entities }) => {
        const user = await predecide(entities);
        const layer = opts?.exposureLogging
          ? Statsig.getLayerSync(user, key)
          : Statsig.getLayerWithExposureLoggingDisabledSync(user, key);
        return getValue(layer);
      },
    };
  }

  return {
    featureGate,
    dynamicConfig,
    experiment,
    autotune,
    layer,
    initialize,
  };
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
 * - `EXPERIMENTATION_CONFIG` - Vercel Edge Config connection string
 * - `EXPERIMENTATION_CONFIG_ITEM_KEY` - Vercel Edge Config item key where data is stored
 */
export function createDefaultStatsigAdapter(): AdapterResponse {
  if (defaultStatsigAdapter) {
    return defaultStatsigAdapter;
  }
  const statsigServerApiKey = process.env.STATSIG_SERVER_API_KEY as string;
  const statsigProjectId = process.env.STATSIG_PROJECT_ID;
  const edgeConfig = process.env.EXPERIMENTATION_CONFIG;
  const edgeConfigItemKey = process.env.EXPERIMENTATION_CONFIG_ITEM_KEY;
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

/**
 * The default Statsig adapter.
 *
 * This is a convenience object that pre-initializes the Statsig SDK and provides
 * the adapter functions for the Feature Gates, Dynamic Configs, Experiments,
 * Autotunes, and Layers.
 *
 * This is the recommended way to use the Statsig adapter.
 *
 * ```ts
 * // flags.ts
 * import { flag } from 'flags/next';
 * import { statsigAdapter } from '@flags-sdk/statsig';
 *
 * const flag = flag({
 *   key: 'my-flag',
 *   defaultValue: false,
 *   adapter: statsigAdapter.featureGate((gate) => gate.value),
 * });
 * ```
 */
export const statsigAdapter: AdapterResponse = {
  featureGate: (...args) => createDefaultStatsigAdapter().featureGate(...args),
  dynamicConfig: (...args) =>
    createDefaultStatsigAdapter().dynamicConfig(...args),
  experiment: (...args) => createDefaultStatsigAdapter().experiment(...args),
  autotune: (...args) => createDefaultStatsigAdapter().autotune(...args),
  layer: (...args) => createDefaultStatsigAdapter().layer(...args),
  initialize: () => createDefaultStatsigAdapter().initialize(),
};
