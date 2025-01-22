export { getProviderData } from './provider';
import { Adapter } from '@vercel/flags';
import Statsig, { type StatsigUser, type StatsigOptions } from 'statsig-node';

interface StatsigUserEntities {
  statsigUser: StatsigUser;
}

/**
 * Create a Statsig adapter for use with the Flags SDK.
 *
 * The adapter expects to use `statsig-node` and `@vercel/edge-config` to resolve flags via
 * Statsig Feature Gates, Experiments, DynamicConfigs, Autotunes, and so on.
 *
 * It will initialize Statsig and resolve values, and will not log exposures. Exposures
 * should be logged on the client side to prevent prefetching or middleware from accidentally
 * triggering exposures when the user has not engaged with a page yet.
 *
 * Methods:
 * - `.()` - Checks a feature gate and returns a boolean value
 * - `.featureGate()` - Checks a feature gate and returns a value based on the result and rule ID
 * - `.experiment()` - Checks an experiment and returns a value based on the result and rule ID
 */
function createStatsigAdapter(options: {
  statsigServerApiKey: string;
  statsigOptions?: StatsigOptions;
  edgeConfig?: {
    connectionString: string;
    itemKey: string;
  };
}) {
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
   * Resolve a Feature Gate and return an object with the boolean value and rule ID
   *
   * The key is based on the `key` property of the flag
   * The entities should extend `{ statsigUser: StatsigUser }`
   */
  const featureGate = <T>(
    mapValue: (value: boolean, ruleId: string) => T,
  ): Adapter<T, StatsigUserEntities> => {
    return {
      decide: async ({ key, entities }) => {
        await initialize();

        if (!isStatsigUser(entities?.statsigUser)) {
          throw new Error('Invalid or missing statsigUser in entities');
        }

        const result = Statsig.getFeatureGateWithExposureLoggingDisabledSync(
          entities?.statsigUser,
          key,
        );
        return mapValue(result.value, result.ruleID);
      },
    };
  };

  /**
   * Resolve a Dynamic Config and return a value based on the result and rule ID.
   *
   * The key is based on the `key` property of the flag
   * The entities should extend `{ statsigUser: StatsigUser }`
   *
   * Used as the basis for experiments, dynamic configs, and autotunes
   */
  const dynamicConfig = <T>(
    mapValue: (value: Record<string, unknown>, ruleId: string) => T,
  ): Adapter<T, StatsigUserEntities> => {
    return {
      decide: async ({ key, entities }) => {
        await initialize();

        if (!isStatsigUser(entities?.statsigUser)) {
          throw new Error('Invalid or missing statsigUser in entities');
        }

        const result = Statsig.getConfigWithExposureLoggingDisabledSync(
          entities?.statsigUser,
          key,
        );
        return mapValue(result.value, result.getRuleID());
      },
    };
  };

  /**
   * Check a feature gate and return a boolean value
   *
   * Because the ruleID is not returned, this default usage is not suited for
   * feature gates with metric lifts. For such usage, see `adapter.featureGate`
   * and include the ruleID in the return value.
   */
  function statsigAdapter(): Adapter<boolean, StatsigUserEntities> {
    return featureGate((value) => value);
  }

  /**
   * Check a layer parameter and return a value based on the result and rule ID.
   *
   * When multiple experiments are running on the same surface, Statsig enables
   * a parameter based workflow agnostic of how many experiments are running.
   *
   * Users will be allocated to one of many experiments, and the parameters will
   * receive values based on the assigned experiment, and defaults from the layer.
   *
   * The key of a flag using this should match `layerName.parameterName`
   */
  const layerParameter = <T>(): Adapter<T, StatsigUserEntities> => {
    return {
      decide: async ({ key, entities }) => {
        // `layer-a.parameter-b` -> Statsig.layer(`layer-a`).getValue(`parameter-b`)
        const [layer, parameterKey] = key.split('.');
        if (!layer || !parameterKey) {
          throw new Error('Layer key must be in the format "layer.parameter"');
        }

        await initialize();

        if (!isStatsigUser(entities?.statsigUser)) {
          throw new Error('Invalid or missing statsigUser in entities');
        }

        const result = Statsig.getLayerWithExposureLoggingDisabledSync(
          entities?.statsigUser,
          layer,
        );
        // defaultValue should be provided to `flag({ adapter, defaultValue, ... })`
        return result.getValue(parameterKey, undefined) as T;
      },
    };
  };

  statsigAdapter.featureGate = featureGate;
  statsigAdapter.experiment = dynamicConfig;
  statsigAdapter.autotune = dynamicConfig;
  statsigAdapter.dynamicConfig = dynamicConfig;
  statsigAdapter.layerParameter = layerParameter;
  statsigAdapter.initialize = initialize;
  return statsigAdapter;
}

export { createStatsigAdapter };

let defaultStatsigAdapter: ReturnType<typeof createStatsigAdapter> | undefined;

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
 * - `STATSIG_EDGE_CONFIG` - Vercel Edge Config connection string
 * - `STATSIG_EDGE_CONFIG_ITEM_KEY` - Vercel Edge Config item key
 */
export default function createDefaultStatsigAdapter() {
  if (defaultStatsigAdapter) {
    return defaultStatsigAdapter;
  }
  const statsigServerApiKey = process.env.STATSIG_SERVER_API_KEY as string;
  // Edge Config is optional
  const edgeConfig = process.env.STATSIG_EDGE_CONFIG;
  const edgeConfigItemKey = process.env.STATSIG_EDGE_CONFIG_ITEM_KEY;
  if (!(edgeConfig && edgeConfigItemKey)) {
    defaultStatsigAdapter = createStatsigAdapter({
      statsigServerApiKey,
    });
  } else {
    defaultStatsigAdapter = createStatsigAdapter({
      statsigServerApiKey,
      edgeConfig: {
        connectionString: edgeConfig,
        itemKey: edgeConfigItemKey,
      },
    });
  }

  return defaultStatsigAdapter;
}
