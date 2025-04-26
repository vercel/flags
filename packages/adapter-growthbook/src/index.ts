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
  setTrackingCallback: (cb: TrackingCallback) => void;
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
}): AdapterResponse {
  let trackingCallback = options.trackingCallback;

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

  function setTrackingCallback(cb: TrackingCallback) {
    trackingCallback = cb;
  }

  return {
    feature,
    initialize,
    setTrackingCallback,
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
 * - `GROWTHBOOK_API_HOST` - Override the features API endpoint for self-hosted users
 * - `GROWTHBOOK_APP_ORIGIN` - Override the application URL for self-hosted users
 */
export function getOrCreateDefaultGrowthbookAdapter(): AdapterResponse {
  if (defaultGrowthbookAdapter) {
    return defaultGrowthbookAdapter;
  }
  const clientKey = process.env.GROWTHBOOK_CLIENT_KEY as string;
  const apiHost = process.env.GROWTHBOOK_API_HOST;
  const appOrigin = process.env.GROWTHBOOK_APP_ORIGIN;

  defaultGrowthbookAdapter = createGrowthbookAdapter({
    clientKey,
    apiHost,
    appOrigin,
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
  feature: (...args) => createGrowthbookAdapter().feature(...args),
  initialize: () => createGrowthbookAdapter().initialize(),
  setTrackingCallback: (...args) =>
    createGrowthbookAdapter().setTrackingCallback(...args),
};
