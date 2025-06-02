import type { Adapter } from 'flags';
import { createClient } from '@vercel/edge-config';
import {
  GrowthBookClient,
  type Attributes,
  type ClientOptions,
  type InitOptions,
  type UserContext,
  type TrackingCallback,
  type TrackingCallbackWithUser,
  type FeatureApiResponse,
  type StickyBucketService,
  type StickyAssignmentsDocument,
} from '@growthbook/growthbook';

export { getProviderData } from './provider';
export {
  GrowthBookClient,
  type Attributes,
  type ClientOptions,
  type InitOptions,
  type UserContext,
  type TrackingCallback,
  type TrackingCallbackWithUser,
  type FeatureApiResponse,
  type StickyBucketService,
  type StickyAssignmentsDocument,
};

type EdgeConfig = {
  connectionString: string;
  /** Defaults to `options.clientKey` **/
  itemKey?: string;
};

type AdapterResponse = {
  feature: <T>() => Adapter<T, Attributes>;
  initialize: () => Promise<GrowthBookClient>;
  setTrackingCallback: (cb: TrackingCallback) => void;
  setStickyBucketService: (stickyBucketService: StickyBucketService) => void;
  stickyBucketService?: StickyBucketService;
  growthbook: GrowthBookClient;
};

/**
 * Create a GrowthBook adapter for use with the Flags SDK.
 */
export function createGrowthbookAdapter(options: {
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
  /** Optional StickyBucketService (reduces variation hopping, required for Bandits) **/
  stickyBucketService?: StickyBucketService;
  /** Provide Edge Config details to use the optional Edge Config adapter */
  edgeConfig?: EdgeConfig;
}): AdapterResponse {
  let trackingCallback = options.trackingCallback;
  let stickyBucketService = options.stickyBucketService;

  const growthbook = new GrowthBookClient({
    clientKey: options.clientKey,
    apiHost: options.apiHost || 'https://cdn.growthbook.io',
    ...(options.clientOptions || {}),
  });

  let _initializePromise: Promise<void> | undefined;

  const initializeGrowthBook = async (): Promise<void> => {
    let payload: FeatureApiResponse | undefined;
    if (options.edgeConfig) {
      try {
        const edgeConfigClient = createClient(
          options.edgeConfig.connectionString,
        );
        payload = await edgeConfigClient.get<FeatureApiResponse>(
          options.edgeConfig.itemKey || options.clientKey,
        );
        if (!payload) {
          console.error('No payload found in edge config');
        }
      } catch (e) {
        console.error('Error fetching edge config', e);
      }
    }

    await growthbook.init({
      streaming: false,
      payload,
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
      decide: async ({ key, entities, defaultValue }) => {
        await initialize();
        const userContext: UserContext = {
          attributes: entities as Attributes,
          trackingCallback: opts.exposureLogging ? trackingCallback : undefined,
        };
        if (stickyBucketService && opts.exposureLogging) {
          const { stickyBucketAssignmentDocs, saveStickyBucketAssignmentDoc } =
            await growthbook.applyStickyBuckets(
              userContext,
              stickyBucketService,
            );
          return (growthbook.evalFeature<T>(key, {
            ...userContext,
            stickyBucketAssignmentDocs,
            saveStickyBucketAssignmentDoc,
          }).value ?? defaultValue) as T;
        }
        return (growthbook.evalFeature<T>(key, userContext).value ??
          defaultValue) as T;
      },
    };
  }

  function setTrackingCallback(cb: TrackingCallback) {
    trackingCallback = cb;
  }

  function setStickyBucketService(sbs: StickyBucketService) {
    stickyBucketService = sbs;
  }

  return {
    feature,
    initialize,
    setTrackingCallback,
    setStickyBucketService,
    stickyBucketService,
    growthbook,
  };
}

let defaultGrowthbookAdapter: AdapterResponse | undefined;

export function resetDefaultGrowthbookAdapter() {
  defaultGrowthbookAdapter = undefined;
}

/**
 * Equivalent to `createGrowthbookAdapter` but with default environment variable names.
 *
 * Required:
 * - `GROWTHBOOK_CLIENT_KEY` - GrowthBook SDK key
 *
 * Optional:
 * - `GROWTHBOOK_API_HOST` - Override the SDK API endpoint for self-hosted users
 * - `GROWTHBOOK_APP_ORIGIN` - Override the application URL for self-hosted users
 * - `GROWTHBOOK_EDGE_CONNECTION_STRING` - Edge Config connection string
 * - `EXPERIMENTATION_CONFIG` - fallback for GROWTHBOOK_EDGE_CONNECTION_STRING
 * - `GROWTHBOOK_EDGE_CONFIG_ITEM_KEY` - Override the item key for Edge Config (defaults to GROWTHBOOK_CLIENT_KEY)
 */
export function getOrCreateDefaultGrowthbookAdapter(): AdapterResponse {
  if (defaultGrowthbookAdapter) {
    return defaultGrowthbookAdapter;
  }
  const clientKey = process.env.GROWTHBOOK_CLIENT_KEY as string;
  if (!clientKey) {
    throw new Error('Missing GROWTHBOOK_CLIENT_KEY env var');
  }
  const apiHost = process.env.GROWTHBOOK_API_HOST;
  const appOrigin = process.env.GROWTHBOOK_APP_ORIGIN;
  const connectionString =
    process.env.GROWTHBOOK_EDGE_CONNECTION_STRING ||
    process.env.EXPERIMENTATION_CONFIG;
  const itemKey = process.env.GROWTHBOOK_EDGE_CONFIG_ITEM_KEY;

  let edgeConfig: EdgeConfig | undefined;
  if (connectionString) {
    edgeConfig = {
      connectionString,
      itemKey,
    };
  }

  defaultGrowthbookAdapter = createGrowthbookAdapter({
    clientKey,
    apiHost,
    appOrigin,
    edgeConfig,
  });

  return defaultGrowthbookAdapter;
}

/**
 * The default GrowthBook adapter.
 *
 * This is a convenience object that pre-initializes the GrowthBook SDK, provides
 * an adapter function for features, and provides a hook to set the experiment exposure
 * tracking callback.
 *
 * This is the recommended way to use the GrowthBook adapter.
 *
 * ```ts
 * // flags.ts
 * import { flag } from 'flags/next';
 * import { growthbookAdapter } from '@flags-sdk/growthbook';
 *
 * const flag = flag({
 *   key: 'my-flag',
 *   defaultValue: false,
 *   adapter: growthbookAdapter.feature(),
 * });
 * ```
 */
export const growthbookAdapter: AdapterResponse = {
  feature: (...args) => getOrCreateDefaultGrowthbookAdapter().feature(...args),
  initialize: () => getOrCreateDefaultGrowthbookAdapter().initialize(),
  setTrackingCallback: (...args) =>
    getOrCreateDefaultGrowthbookAdapter().setTrackingCallback(...args),
  setStickyBucketService: (...args) =>
    getOrCreateDefaultGrowthbookAdapter().setStickyBucketService(...args),
  growthbook: getOrCreateDefaultGrowthbookAdapter().growthbook,
};
