import type { Adapter, FlagDefinitionsType } from 'flags';
import {
  BucketClient,
  ClientOptions,
  Context,
  ContextWithTracking,
} from '@bucketco/node-sdk';
import { ProviderData } from 'flags';

export type { Context };

type AdapterOptions = Pick<ContextWithTracking, 'enableTracking' | 'meta'>;

type AdapterResponse = {
  featureIsEnabled: (options?: AdapterOptions) => Adapter<boolean, Context>;
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

  async function initialize() {
    if (!bucketClient) {
      bucketClient = new BucketClient(clientOptions);
    }
    // this can be called multiple times. Same promise is returned.
    return bucketClient.initialize();
  }

  function featureIsEnabled(
    options?: AdapterOptions,
  ): Adapter<boolean, Context> {
    return {
      async decide({ key, entities }): Promise<boolean> {
        await initialize();

        return bucketClient.getFeature({ ...options, ...entities }, key)
          .isEnabled;
      },
    };
  }

  return {
    featureIsEnabled,
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
 *   adapter: bucketAdapter.featureIsEnabled(),
 * });
 * ```
 */
export const bucketAdapter: AdapterResponse = {
  featureIsEnabled: (...args) =>
    getOrCreateDefaultAdapter().featureIsEnabled(...args),
  bucketClient: async () => {
    return getOrCreateDefaultAdapter().bucketClient();
  },
};

export async function getProviderData({
  bucketClient,
}: {
  /**
   * The BucketClient instance.
   */
  bucketClient: BucketClient;
}): Promise<ProviderData> {
  await bucketClient.initialize();

  const features = await bucketClient.getFeatureDefinitions();

  return {
    definitions: features.reduce<FlagDefinitionsType>((acc, item) => {
      acc[item.key] = {
        options: [
          { label: 'Disabled', value: false },
          { label: 'Enabled', value: true },
        ],
        description: item.description ?? undefined,
      };
      return acc;
    }, {}),
    hints: [],
  };
}
