import type { Adapter } from 'flags';
import {
  GrowthBookClient,
  type ClientOptions,
  type InitOptions,
  type Attributes,
  type UserContext,
  type TrackingCallback,
} from '@growthbook/growthbook';
// import {
//   createEdgeConfigDataAdapter,
//   createSyncingHandler,
// } from './edge-runtime-hooks';

export { getProviderData } from './provider';
export { GrowthBookClient };

type AdapterResponse = {
  feature: <T>() => Adapter<T, Attributes>;
  initialize: () => Promise<GrowthBookClient>;
};

/**
 * Create a GrowthBook adapter for use with the Flags SDK.
 */
export function createGrowthBookAdapter(options: {
  /** GrowthBook SDK key **/
  clientKey: string;
  /** Callback to log experiment exposures **/
  trackingCallback?: TrackingCallback;
  /** Override the features API endpoint for self-hosted users **/
  apiHost?: string;
  /** Override the application URL for self-hosted users **/
  appOrigin?: string;
  /** Optional GrowthBook SDK constructor options **/
  clientOptions?: ClientOptions;
  /** Optional GrowthBook SDK init() options **/
  initOptions?: InitOptions;
}): AdapterResponse {
  const trackingCallback = options.trackingCallback;

  const growthbook = new GrowthBookClient({
    clientKey: options.clientKey,
    apiHost: options.apiHost || 'https://cdn.growthbook.io',
    ...(options.clientOptions || {}),
  });

  let _initializePromise: Promise<void> | undefined;

  const initializeGrowthBook = async (): Promise<void> => {
    // todo: fetch from "edge"?
    let payload = undefined;

    await growthbook.init({
      payload,
      streaming: false,
      ...(options.initOptions || {}),
    });
  };

  /**
   * Initialize the GrowthBook SDK.
   *
   * This must be called before checking feature flags or experiments.
   * It is deduplicated to prevent multiple calls from being made.
   * You can pre-initialize the SDK by calling `adapter.initialize()`,
   * otherwise it will be initialized lazily when needed.
   */
  const initialize = async (): Promise<GrowthBookClient> => {
    if (!_initializePromise) {
      _initializePromise = initializeGrowthBook();
    }
    await _initializePromise;
    return growthbook;
  };

  function origin(prefix: string) {
    return (key: string) => {
      const appOrigin = options.appOrigin || 'https://app.growthbook.io';
      return `${appOrigin}/${prefix}/${key}`;
    };
  }

  /**
   * Resolve a feature flag.
   *
   * Implements `decide` to resolve the feature with `GrowthBook.evalFeature`
   *
   * Implements `origin` to link to the flag in the GrowthBook app
   */
  function feature<T>(
    opts: {
      exposureLogging?: boolean;
    } = {
      exposureLogging: true,
    },
  ): Adapter<T, Attributes> {
    return {
      origin: origin('features'),
      decide: async ({
        key,
        entities,
      }: {
        key: string;
        entities: Attributes;
      }) => {
        await initialize();
        const userContext: UserContext = {
          attributes: entities,
          trackingCallback: opts.exposureLogging ? trackingCallback : undefined,
        };
        return growthbook.evalFeature<T>(key, userContext).value;
      },
    };
  }

  return {
    feature,
    initialize,
  };
}

let defaultGrowthbookAdapter: AdapterResponse | undefined;

export function resetDefaultGrowthbookAdapter() {
  defaultGrowthbookAdapter = undefined;
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
export function createDefaultGrowthbookAdapter(): AdapterResponse {
  if (defaultGrowthbookAdapter) {
    return defaultGrowthbookAdapter;
  }
  const statsigServerApiKey = process.env.STATSIG_SERVER_API_KEY as string;
  const statsigProjectId = process.env.STATSIG_PROJECT_ID;
  const edgeConfig = process.env.EXPERIMENTATION_CONFIG;
  const edgeConfigItemKey = process.env.EXPERIMENTATION_CONFIG_ITEM_KEY;
  if (!(edgeConfig && edgeConfigItemKey)) {
    defaultGrowthbookAdapter = createStatsigAdapter({
      statsigServerApiKey,
      statsigProjectId,
    });
  } else {
    defaultGrowthbookAdapter = createStatsigAdapter({
      statsigServerApiKey,
      edgeConfig: {
        connectionString: edgeConfig,
        itemKey: edgeConfigItemKey,
      },
      statsigProjectId,
    });
  }

  return defaultGrowthbookAdapter;
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
export const growthbookAdapter: AdapterResponse = {
  feature: (...args) => createGrowthBookAdapter().feature(...args),
  initialize: () => createDefaultStatsigAdapter().initialize(),
};
