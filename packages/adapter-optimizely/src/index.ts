export { getProviderData } from './provider';
import {
  Client,
  OpaqueConfigManager,
  OptimizelyDecision,
  OptimizelyUserContext,
  UserAttributes,
} from '@optimizely/optimizely-sdk';

import type { Adapter } from 'flags';
import { dispatchEvent } from './edge-runtime-hooks';
import {
  createForwardingEventProcessor,
  createInstance,
  createPollingProjectConfigManager,
  createStaticProjectConfigManager,
  RequestHandler,
} from '@optimizely/optimizely-sdk/universal';
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
  userContext: (
    entities: UserId,
    attributes?: UserAttributes,
  ) => Promise<OptimizelyUserContext>;
  initialize: () => Promise<Client>;
};

/**
 * The node instance has a hardcoded XHR request handler that will break in edge runtime,
 * so we need to use a custom request handler that uses fetch.
 */
const requestHandler: RequestHandler = {
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
};

export function createOptimizelyAdapter({
  sdkKey,
  edgeConfig,
}: {
  sdkKey?: string;
  edgeConfig?: {
    connectionString: string;
    itemKey: string;
  };
}): AdapterResponse {
  let optimizelyInstance: Client | undefined;

  const initializeOptimizely = async () => {
    let projectConfigManager: OpaqueConfigManager | undefined;
    if (edgeConfig) {
      const edgeConfigClient = createClient(edgeConfig.connectionString);
      const datafile = await edgeConfigClient.get<string>(edgeConfig.itemKey);

      if (!datafile) {
        throw new Error(
          'Optimizely Adapter: Could not get datafile from edge config',
        );
      }

      projectConfigManager = createStaticProjectConfigManager({
        datafile: JSON.stringify(datafile),
      });
    }

    if (!projectConfigManager && sdkKey) {
      projectConfigManager = createPollingProjectConfigManager({
        sdkKey: sdkKey,
        updateInterval: 10000,
        requestHandler,
      });
    }

    if (!projectConfigManager) {
      throw new Error(
        'Optimizely Adapter: Could not create project config manager, either edgeConfig or sdkKey must be provided',
      );
    }

    try {
      optimizelyInstance = createInstance({
        clientEngine: 'javascript-sdk/flags-sdk',
        projectConfigManager,
        // @ts-expect-error - dispatchEvent runs in `waitUntil` so it's not going to return a response
        eventProcessor: createForwardingEventProcessor({ dispatchEvent }),
        requestHandler,
      });
    } catch (error) {
      throw new Error(
        `Optimizely Adapter: Error creating optimizely instance, ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    // This resolves instantly when using the edge config, the timeout is just for fetching the datafile from the polling project config manager
    await optimizelyInstance.onReady({ timeout: 500 });
  };

  let _initializePromise: Promise<void> | undefined;
  const initialize = async () => {
    if (!_initializePromise) {
      _initializePromise = initializeOptimizely();
    }
    await _initializePromise;
    if (!optimizelyInstance) {
      throw new Error(
        'Optimizely Adapter: Optimizely instance not initialized',
      );
    }
    return optimizelyInstance;
  };

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
          throw new Error(
            'Optimizely Adapter: Optimizely instance not initialized',
          );
        }
        const context = optimizelyInstance.createUserContext(
          entities,
          attributes,
        );
        return getValue(context.decide(key));
      },
    };
  }

  async function userContext(
    entities: UserId,
    attributes?: UserAttributes,
  ): Promise<OptimizelyUserContext> {
    await initialize();
    if (!optimizelyInstance) {
      throw new Error(
        'Optimizely Adapter: Optimizely instance not initialized',
      );
    }
    return optimizelyInstance.createUserContext(entities, attributes);
  }

  return {
    decide,
    userContext,
    initialize,
  };
}

function getOrCreateDefaultOptimizelyAdapter(): AdapterResponse {
  const sdkKey = process.env.OPTIMIZELY_SDK_KEY;
  const edgeConfigConnectionString = process.env.EDGE_CONFIG_CONNECTION_STRING;
  const edgeConfigItemKey = process.env.OPTIMIZELY_DATAFILE_ITEM_KEY;

  if (!defaultOptimizelyAdapter) {
    if (edgeConfigConnectionString && edgeConfigItemKey) {
      defaultOptimizelyAdapter = createOptimizelyAdapter({
        sdkKey,
        edgeConfig: {
          connectionString: edgeConfigConnectionString,
          itemKey: edgeConfigItemKey,
        },
      });
    } else {
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
  userContext: (...args) =>
    getOrCreateDefaultOptimizelyAdapter().userContext(...args),
  initialize: () => getOrCreateDefaultOptimizelyAdapter().initialize(),
};
