export { getProviderData } from './provider';
import { Adapter } from '@vercel/flags';
import Statsig, { type StatsigUser, type StatsigOptions } from 'statsig-node';
import { EdgeConfigDataAdapter } from 'statsig-node-vercel';
import { createClient } from '@vercel/edge-config';

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
  statsigSecretKey: string;
  statsigOptions?: StatsigOptions;
  edgeConfig?: {
    connectionString: string;
    itemKey: string;
  };
}) {
  const dataAdapter = options.edgeConfig
    ? new EdgeConfigDataAdapter({
        edgeConfigItemKey: options.edgeConfig.itemKey,
        edgeConfigClient: createClient(options.edgeConfig.connectionString),
      })
    : undefined;

  const initializeStatsig = async (): Promise<void> => {
    await Statsig.initialize(options.statsigSecretKey, {
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
        const result = Statsig.getFeatureGateWithExposureLoggingDisabledSync(
          entities?.statsigUser as StatsigUser,
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
        const result = Statsig.getConfigWithExposureLoggingDisabledSync(
          entities?.statsigUser as StatsigUser,
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

  statsigAdapter.featureGate = featureGate;
  statsigAdapter.experiment = dynamicConfig;
  statsigAdapter.dynamicConfig = dynamicConfig;
  statsigAdapter.autotune = dynamicConfig;
  statsigAdapter.initialize = initialize;
  return statsigAdapter;
}

export { createStatsigAdapter };
