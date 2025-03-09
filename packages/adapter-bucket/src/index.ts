import type { Adapter } from 'flags';
import {
  BucketClient,
  ClientOptions,
  Context,
  ContextWithTracking,
  Feature,
} from '@bucketco/node-sdk';
import { FeatureRemoteConfig } from '@bucketco/node-sdk/dist/types/src/types';

export type { Context };

type AdapterOptions = Pick<ContextWithTracking, 'enableTracking' | 'meta'>;

type AdapterResponse = {
  feature: <ValueType>(options?: AdapterOptions) => Adapter<ValueType, Context>;
  featureConfig: (opts?: {
    /**
     * Allows overriding the key used to fetch the feature.
     */
    key?: string;
    /**
     * These options are passed to the Bucket SDK when fetching the feature.
     */
    options?: AdapterOptions;
  }) => Adapter<Feature<FeatureRemoteConfig>, Context>;
  /** The Bucket client instance used by the adapter. */
  bucketClient: () => Promise<BucketClient>;
};

let defaultBucketAdapter: ReturnType<typeof createBucketAdapter> | undefined;

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`@flags-sdk/bucket: Missing ${name} environment variable`);
  }
  return value;
}

export function createBucketAdapter(
  clientOptions: ClientOptions,
): AdapterResponse {
  let bucketClient: BucketClient;
  let initPromise: Promise<void>;

  async function initialize() {
    if (initPromise) await initPromise;
    if (bucketClient) return bucketClient;
    bucketClient = new BucketClient(clientOptions);
    initPromise = bucketClient.initialize();
    await initPromise;
  }

  function feature<ValueType>(
    options?: AdapterOptions,
  ): Adapter<ValueType, Context> {
    return {
      async decide({ key, entities }): Promise<ValueType> {
        await initialize();

        return bucketClient.getFeature({ ...options, ...entities }, key)
          .isEnabled as ValueType;
      },
    };
  }

  /**
   * featureConfig can not be precomputed or overridden as it returns the raw Feature,
   * which contains a track() function that can not be serialized.
   */
  function featureConfig(opts?: {
    key?: string;
    options?: AdapterOptions;
  }): Adapter<Feature<FeatureRemoteConfig>, Context> {
    return {
      async decide({ key, entities }) {
        await initialize();
        const feature = bucketClient.getFeature(
          { ...opts?.options, ...entities },
          opts?.key ?? key,
        );
        return feature;
      },
    };
  }

  return {
    feature,
    featureConfig: featureConfig,
    bucketClient: async () => {
      await initialize();
      return bucketClient;
    },
  };
}

function getOrCreateDefaultAdapter() {
  if (!defaultBucketAdapter) {
    const secretKey = assertEnv('BUCKET_SECRET_KEY');

    defaultBucketAdapter = createBucketAdapter({ secretKey });
  }

  return defaultBucketAdapter;
}

/**
 * The default Bucket adapter.
 *
 * This is a convenience object that pre-initializes the Bucket SDK and provides
 * the adapter function for usage with the Flags SDK.
 *
 * This is the recommended way to use the Bucket adapter.
 *
 * ```ts
 * // flags.ts
 * import { flag } from 'flags/next';
 * import { bucketAdapter, type Context } from '@flags-sdk/bucket';
 *
 * const flag = flag<boolean, Context>({
 *   key: 'my-flag',
 *   defaultValue: false,
 *   identify: () => ({ key: "user-123" }),
 *   adapter: bucketAdapter.feature(),
 * });
 * ```
 */
export const bucketAdapter: AdapterResponse = {
  feature: (...args) => getOrCreateDefaultAdapter().feature(...args),
  featureConfig: (...args) =>
    getOrCreateDefaultAdapter().featureConfig(...args),
  bucketClient: async () => {
    return getOrCreateDefaultAdapter().bucketClient();
  },
};
