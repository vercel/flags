import type { Adapter } from 'flags';
import {
  GrowthBookClient,
  type ClientOptions,
  type InitOptions,
  type Attributes,
  type TrackingCallback,
} from '@growthbook/growthbook';
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
export declare function createGrowthbookAdapter(options: {
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
}): AdapterResponse;
export declare function resetDefaultGrowthbookAdapter(): void;
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
export declare function getOrCreateDefaultGrowthbookAdapter(): AdapterResponse;
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
export declare const growthbookAdapter: AdapterResponse;
//# sourceMappingURL=index.d.ts.map
