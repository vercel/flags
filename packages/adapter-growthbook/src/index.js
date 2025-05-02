import { GrowthBookClient } from '@growthbook/growthbook';
export { getProviderData } from './provider';
export { GrowthBookClient };
/**
 * Create a GrowthBook adapter for use with the Flags SDK.
 */
export function createGrowthbookAdapter(options) {
  let trackingCallback = options.trackingCallback;
  const growthbook = new GrowthBookClient({
    clientKey: options.clientKey,
    apiHost: options.apiHost || 'https://cdn.growthbook.io',
    ...(options.clientOptions || {}),
  });
  let _initializePromise;
  const initializeGrowthBook = async () => {
    await growthbook.init({
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
  const initialize = async () => {
    if (!_initializePromise) {
      _initializePromise = initializeGrowthBook();
    }
    await _initializePromise;
    return growthbook;
  };
  function origin(prefix) {
    return (key) => {
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
  function feature(
    opts = {
      exposureLogging: true,
    },
  ) {
    return {
      origin: origin('features'),
      decide: async ({ key, entities }) => {
        await initialize();
        const userContext = {
          attributes: entities,
          trackingCallback: opts.exposureLogging ? trackingCallback : undefined,
        };
        return growthbook.evalFeature(key, userContext).value;
      },
    };
  }
  function setTrackingCallback(cb) {
    trackingCallback = cb;
  }
  return {
    feature,
    initialize,
    setTrackingCallback,
  };
}
let defaultGrowthbookAdapter;
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
 */
export function getOrCreateDefaultGrowthbookAdapter() {
  if (defaultGrowthbookAdapter) {
    return defaultGrowthbookAdapter;
  }
  const clientKey = process.env.GROWTHBOOK_CLIENT_KEY;
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
export const growthbookAdapter = {
  feature: (...args) => createGrowthbookAdapter().feature(...args),
  initialize: () => createGrowthbookAdapter().initialize(),
  setTrackingCallback: (...args) =>
    createGrowthbookAdapter().setTrackingCallback(...args),
};
