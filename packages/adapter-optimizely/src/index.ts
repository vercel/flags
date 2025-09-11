export { getProviderData } from './provider';
import {
  Client,
  createBatchEventProcessor,
  createPollingProjectConfigManager,
  OpaqueConfigManager,
  OptimizelyDecision,
  UserAttributes,
} from '@optimizely/optimizely-sdk';
import { createInstance } from '@optimizely/optimizely-sdk/dist/index.universal';
import type { OptimizelyUserContext } from '@optimizely/optimizely-sdk';
import type { Adapter } from 'flags';
import {
  createEdgeProjectConfigManager,
  dispatchEvent,
} from './edge-runtime-hooks';
import { AbortableRequest } from '@optimizely/optimizely-sdk/dist/utils/http_request_handler/http';

let defaultOptimizelyAdapter:
  | ReturnType<typeof createOptimizelyAdapter>
  | undefined;

// Re-typing string to clarify what the string is for
type UserId = string;

type AdapterResponse = {
  decide: <T extends OptimizelyDecision>(
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
  sdkKey: string;
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
      projectConfigManager = await createEdgeProjectConfigManager({
        edgeConfigItemKey: edgeConfigItemKey,
        edgeConfigConnectionString: edgeConfig.connectionString,
      });
    } else {
      projectConfigManager = createPollingProjectConfigManager({
        sdkKey: sdkKey,
        updateInterval: 10000,
      });
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
      // Request handler can be used for personalization, both `node` and `browser` versions of the SDK have invalid
      // request mechanisms for edge runtimes (XHR and node http(s)), hence the fetch wrapper.
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
          } satisfies AbortableRequest;
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
        const context = await predecide(entities, attributes);
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
  const sdkKey = assertEnv('OPTIMIZELY_SDK_KEY');
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
