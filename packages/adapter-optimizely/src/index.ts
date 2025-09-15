export { getProviderData } from './provider';
import {
  Client,
  createBatchEventProcessor,
  createPollingProjectConfigManager,
  createStaticProjectConfigManager,
  OpaqueConfigManager,
  OptimizelyDecision,
  UserAttributes,
} from '@optimizely/optimizely-sdk';

import type { OptimizelyUserContext } from '@optimizely/optimizely-sdk';
import type { Adapter } from 'flags';
import { dispatchEvent } from './edge-runtime-hooks';
import { createInstance } from '@optimizely/optimizely-sdk/universal';
import { createClient } from '@vercel/edge-config';

let defaultOptimizelyAdapter:
  | ReturnType<typeof createOptimizelyAdapter>
  | undefined;

// Re-typing string to clarify what the string is for
export type UserId = string;

type AdapterResponse = {
  decide: <T>(
    getValue: (decision: OptimizelyDecision) => T,
    {
      attributes,
    }: {
      attributes?: UserAttributes;
    },
  ) => Adapter<T, UserId>;
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
  sdkKey?: string;
  edgeConfig?: {
    connectionString: string;
    itemKey: string;
  };
  edgeConfigItemKey?: string;
}): AdapterResponse {
  let optimizelyInstance: Client | undefined;

  const initializeOptimizely = async () => {
    let projectConfigManager: OpaqueConfigManager | undefined;
    if (edgeConfig && edgeConfigItemKey) {
      const edgeConfigClient = createClient(edgeConfig.connectionString);
      const datafile = await edgeConfigClient.get<string>(edgeConfigItemKey);

      if (datafile) {
        projectConfigManager = createStaticProjectConfigManager({
          datafile,
        });
      }
    }

    if (!projectConfigManager && sdkKey) {
      projectConfigManager = createPollingProjectConfigManager({
        sdkKey: sdkKey,
        updateInterval: 10000,
      });
    }

    if (!projectConfigManager) {
      throw new Error(
        'Optimizely Adapter: Could not create project config manager, either edgeConfig or sdkKey must be provided',
      );
    }

    optimizelyInstance = createInstance({
      clientEngine: 'javascript-sdk/flags-sdk',
      projectConfigManager,
      // TODO: Check if batch event processor works here or if we should just force a single `waitUntil` flush of all events
      eventProcessor: createBatchEventProcessor({
        // TODO: Check if running this in a `waitUntil()` doesn't break things
        // @ts-expect-error - dispatchEvent runs in `waitUntil` so it's not going to return a response
        eventDispatcher: { dispatchEvent },
      }),
      // The node instance has a hardcoded XHR request handler that will break in edge runtime
      // so we need to use a custom request handler that uses fetch
      requestHandler: {
        makeRequest(requestUrl, headers, method, data) {
          const abortController = new AbortController();

          const responsePromise = fetch(requestUrl, {
            headers: headers as any,
            method,
            body: data,
            signal: abortController.signal,
          });
          return {
            abort: () => abortController.abort(),
            responsePromise: responsePromise.then(async (response) => {
              const headersObj: Record<string, string> = {};
              response.headers.forEach((value, key) => {
                headersObj[key] = value;
              });
              return {
                statusCode: response.status,
                body: (await response.text()) ?? '',
                headers: headersObj,
              };
            }),
          };
        },
      },
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
    userId?: string,
    attributes?: UserAttributes,
  ): Promise<OptimizelyUserContext> {
    await initialize();
    if (!optimizelyInstance) {
      throw new Error('Optimizely instance not initialized');
    }
    const context = optimizelyInstance.createUserContext(userId, attributes);
    return context;
  }

  function decide<T>(
    getValue: (decision: OptimizelyDecision) => T,
    {
      attributes,
    }: {
      attributes?: UserAttributes;
    },
  ): Adapter<T, UserId> {
    return {
      decide: async ({ key, entities }) => {
        await initialize();
        if (!optimizelyInstance) {
          throw new Error('Optimizely instance not initialized');
        }
        const context = optimizelyInstance.createUserContext(
          entities,
          attributes,
        );
        return getValue(context.decide(key));
      },
    };
  }

  return {
    decide,
    initialize,
  };
}

function getOrCreateDefaultOptimizelyAdapter(): AdapterResponse {
  const sdkKey = process.env.OPTIMIZELY_SDK_KEY;
  const edgeConfig = process.env.EDGE_CONFIG_CONNECTION_STRING;
  const edgeConfigItemKey = process.env.OPTIMIZELY_DATAFILE_ITEM_KEY;

  if (!defaultOptimizelyAdapter) {
    if (edgeConfig && edgeConfigItemKey) {
      defaultOptimizelyAdapter = createOptimizelyAdapter({
        sdkKey,
        edgeConfig: {
          connectionString: edgeConfig,
          itemKey: edgeConfigItemKey,
        },
      });
    } else {
      // Fallback to polling optimizely SDK
      defaultOptimizelyAdapter = createOptimizelyAdapter({
        sdkKey,
      });
    }
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
 *   adapter: optimizelyAdapter.decide((decision) => decision.enabled),
 * });
 * ```
 */
export const optimizelyAdapter: AdapterResponse = {
  decide: (...args) => getOrCreateDefaultOptimizelyAdapter().decide(...args),
  initialize: () => getOrCreateDefaultOptimizelyAdapter().initialize(),
};
