export { getProviderData } from './provider';
import { Adapter } from '@vercel/flags';
import { Statsig, type StatsigUser, type StatsigOptions } from 'statsig-node';
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
  const edgeConfigClient = options.edgeConfig
    ? createClient(options.edgeConfig.connectionString)
    : undefined;

  const dataAdapter =
    edgeConfigClient && options.edgeConfig?.itemKey
      ? new EdgeConfigDataAdapter({
          edgeConfigItemKey: options.edgeConfig.itemKey,
          edgeConfigClient,
        })
      : undefined;

  let _statsigClient: ReturnType<typeof Statsig.initialize>;
  const getStatsigClient = () => {
    if (!_statsigClient) {
      throw new Error('Statsig client not initialized');
    }
    return _statsigClient;
  };

  const initialize = async () => {
    _statsigClient = Statsig.initialize(options.statsigSecretKey, {
      dataAdapter,
      initStrategyForIDLists: 'none',
      disableIdListsSync: true,
      ...options.statsigOptions,
    });
    await _statsigClient;
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
      initialize,
      decide: async ({ key, entities }) => {
        await getStatsigClient();
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
   */
  const resolveDynamicConfig = <T>(
    mapValue: (value: Record<string, unknown>, ruleId: string) => T,
  ): Adapter<T, StatsigUserEntities> => {
    return {
      initialize,
      decide: async ({ key, entities }) => {
        await getStatsigClient();
        const result = Statsig.getConfigWithExposureLoggingDisabledSync(
          entities?.statsigUser as StatsigUser,
          key,
        );
        return mapValue(result.value, result.getRuleID());
      },
    };
  };

  /** Check a feature gate and return a boolean value */
  function statsigAdapter(): Adapter<boolean, StatsigUserEntities> {
    return featureGate((value) => value);
  }
  // while statsigAdapter() works well as a feature flag, when metric lifts are tracked
  // through exposures on the client, it's better to use statsigAdapter.featureGate(...)
  // ...and map the rule ID into the return value
  statsigAdapter.featureGate = featureGate;
  // experiment, dynamicConfig, and autotune are all DynamicConfig objects
  statsigAdapter.experiment = resolveDynamicConfig;
  statsigAdapter.dynamicConfig = resolveDynamicConfig;
  statsigAdapter.autotune = resolveDynamicConfig;
  return statsigAdapter;
}

export { createStatsigAdapter };
