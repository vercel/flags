export { getProviderData } from './provider';
import {
  Client,
  createBatchEventProcessor,
  createInstance,
  UserAttributes,
} from '@optimizely/optimizely-sdk';
import { IOptimizelyUserContext } from '@optimizely/optimizely-sdk/dist/optimizely_user_context';
import type { Adapter } from 'flags';
import {
  createEdgeProjectConfigManager,
  dispatchEvent,
} from './edge-runtime-hooks';

let defaultOptimizelyAdapter:
  | ReturnType<typeof createOptimizelyAdapter>
  | undefined;

// Just re-typing string for now to make it clear what the context is
type UserId = string;

type AdapterResponse = {
  decide: <T>({
    attributes,
  }: {
    attributes?: UserAttributes;
  }) => Adapter<T, UserId>;
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
  edgeConfig,
  edgeConfigItemKey,
}: {
  sdkKey: string;
  edgeConfig: string;
  edgeConfigItemKey: string;
}): AdapterResponse {
  let optimizelyInstance: Client | undefined;

  const initializeOptimizely = async () => {
    const edgeProjectConfigManager = await createEdgeProjectConfigManager({
      edgeConfigItemKey: edgeConfigItemKey,
      edgeConfigConnectionString: edgeConfig,
    });

    optimizelyInstance = createInstance({
      clientEngine: 'javascript-sdk/flags-sdk',
      projectConfigManager: edgeProjectConfigManager,
      // TODO: Check if batch event processor works here or if we should just force a single `waitUntil` flush of all events
      eventProcessor: createBatchEventProcessor({
        // TODO: Check if running this in a `waitUntil()` doesn't break things
        // @ts-expect-error - dispatchEvent runs in `waitUntil` so it's not going to return a response
        eventDispatcher: { dispatchEvent },
      }),
    });

    await optimizelyInstance.onReady({ timeout: 500 });
  };

  let _initializePromise: Promise<void> | undefined;
  const initialize = async () => {
    if (!_initializePromise) {
      _initializePromise = initializeOptimizely();
    }
    await _initializePromise;
    if (!optimizelyInstance) {
      throw new Error('Optimizely instance not initialized');
    }
    return optimizelyInstance;
  };

  /**
   * Sets up the Optimizely instance and creates a user context
   */
  async function predecide(
    userId: string,
    attributes?: UserAttributes,
  ): Promise<IOptimizelyUserContext> {
    await initialize();
    if (!optimizelyInstance) {
      throw new Error('Optimizely instance not initialized');
    }
    const context = optimizelyInstance.createUserContext(userId, attributes);
    return context;
  }

  function decide<T>({
    attributes,
  }: {
    attributes?: UserAttributes;
  }): Adapter<T, UserId> {
    return {
      decide: async ({ key, entities }) => {
        const context = await predecide(entities, attributes);
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
      edgeConfig: assertEnv('EDGE_CONFIG_CONNECTION_STRING'),
      edgeConfigItemKey: assertEnv('OPTIMIZELY_DATAFILE_ITEM_KEY'),
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
 *   adapter: optimizelyAdapter.decide(),
 * });
 * ```
 */
export const optimizelyAdapter: AdapterResponse = {
  decide: (...args) => getOrCreateDefaultOptimizelyAdapter().decide(...args),
  initialize: () => getOrCreateDefaultOptimizelyAdapter().initialize(),
};
