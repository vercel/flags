export { getProviderData } from './provider';
import {
  Client,
  createInstance,
  createPollingProjectConfigManager,
} from '@optimizely/optimizely-sdk';
import type { Adapter } from 'flags';

let defaultOptimizelyAdapter:
  | ReturnType<typeof createOptimizelyAdapter>
  | undefined;

// Just re-typing string for now to make it clear what the context is
type UserId = string;

type AdapterResponse = {
  decide: <T>() => Adapter<T, UserId>;
  initialize: () => Promise<Client>;
};

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Optimizely Adapter: Missing ${name} environment variable`);
  }
  return value;
}

export function createOptimizelyAdapter({
  sdkKey,
}: {
  sdkKey: string;
}): AdapterResponse {
  let optimizelyInstance: Client | undefined;
  const initializeOptimizely = async () => {
    optimizelyInstance = createInstance({
      clientEngine: 'edge-config',
      // TODO: Check if polling project config would work for edge middleware
      projectConfigManager: createPollingProjectConfigManager({
        sdkKey: sdkKey,
      }),
      // TODO: Add edge-proof event processor
    });

    await optimizelyInstance.onReady({ timeout: 500 });
  };

  let _initializePromise: Promise<void> | undefined;
  const initialize = async () => {
    if (!_initializePromise) {
      _initializePromise = initializeOptimizely();
    }
    await _initializePromise;
    // TODO: Check if needed
    if (!optimizelyInstance) {
      throw new Error('Optimizely instance not initialized');
    }
    return optimizelyInstance;
  };

  function origin(key: string) {
    return `https://app.optimizely.com/projects/${sdkKey}/flags/${key}/`;
  }
  function decide<T>(): Adapter<T, UserId> {
    return {
      async decide({ key, entities }) {
        await initialize();

        // TODO: Make sure it's always initialized
        if (!optimizelyInstance) {
          throw new Error('Optimizely instance not initialized');
        }

        const context = optimizelyInstance.createUserContext(entities);

        return context.decide(key);
      },
    };
  }

  return {
    decide,
    initialize,
  };
}

function getOrCreateDefaultOptimizelyAdapter(): AdapterResponse {
  if (!defaultOptimizelyAdapter) {
    defaultOptimizelyAdapter = createOptimizelyAdapter({
      sdkKey: assertEnv('OPTIMIZELY_SDK_KEY'),
    });
  }

  return defaultOptimizelyAdapter;
}

/**
 * The default Optimizely adapter.
 *
 * This is a convenience object that pre-initializes the Optimizely SDK and provides
 * the adapter functions for the Feature Flags.
 *
 * This is the recommended way to use the Optimizely adapter.
 *
 * ```ts
 * // flags.ts
 * import { flag } from 'flags/next';
 * import { optimizelyAdapter } from '@flags-sdk/optimizely';
 *
 * const flag = flag({
 *   key: 'my-flag',
 *   defaultValue: false,
 *   adapter: optimizelyAdapter.isFeatureEnabled(),
 * });
 * ```
 */
export const optimizelyAdapter: AdapterResponse = {
  isFeatureEnabled: (...args) =>
    getOrCreateDefaultOptimizelyAdapter().isFeatureEnabled(...args),
  initialize: () => getOrCreateDefaultOptimizelyAdapter().initialize(),
};
