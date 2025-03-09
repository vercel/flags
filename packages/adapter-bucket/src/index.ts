import type { Adapter } from 'flags';
import {
  BucketClient,
  ClientOptions,
  Context,
  ContextWithTracking,
  TypedFeatures,
} from '@bucketco/node-sdk';

export { getProviderData } from './provider';
export type { Context };

type AdapterOptions = Pick<ContextWithTracking, 'enableTracking' | 'meta'>;

type AdapterResponse = {
  feature: <ValueType>(options?: AdapterOptions) => Adapter<ValueType, Context>;
  featureConfig: <ValueType>(
    getter: (value: TypedFeatures[string]) => ValueType,
    options?: AdapterOptions,
  ) => Adapter<ValueType, Context>;
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

  function featureConfig<ValueType>(
    getter: (value: TypedFeatures[string]) => ValueType | undefined,
    options?: AdapterOptions,
  ): Adapter<ValueType, Context> {
    return {
      async decide({ key, entities }): Promise<ValueType> {
        await initialize();

        const value = bucketClient.getFeature({ ...options, ...entities }, key);

        return getter(value) as ValueType;
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
