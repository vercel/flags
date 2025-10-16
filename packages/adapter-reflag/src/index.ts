import {
  type ClientOptions,
  type Context,
  type ContextWithTracking,
  ReflagClient,
} from '@reflag/node-sdk';
import type { Adapter, FlagDefinitionsType, ProviderData } from 'flags';

export type { Context };

type AdapterOptions = Pick<ContextWithTracking, 'enableTracking' | 'meta'>;

type AdapterResponse = {
  isEnabled: (options?: AdapterOptions) => Adapter<boolean, Context>;
  /** The Reflag client instance used by the adapter. */
  reflagClient: () => Promise<ReflagClient>;
};

let defaultReflagAdapter: ReturnType<typeof createReflagAdapter> | undefined;

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`@flags-sdk/reflag: Missing ${name} environment variable`);
  }
  return value;
}

export function createReflagAdapter(
  clientOptions: ClientOptions,
): AdapterResponse {
  let reflagClient: ReflagClient;

  async function initialize() {
    if (!reflagClient) {
      try {
        reflagClient = new ReflagClient(clientOptions);
      } catch (err) {
        // explicitly log out the error, otherwise it's swallowed
        console.error('@flags-sdk/reflag: Error creating reflagClient', err);
        throw err;
      }
    }

    // this can be called multiple times. Same promise is returned.
    return reflagClient.initialize();
  }

  function isEnabled(options?: AdapterOptions): Adapter<boolean, Context> {
    return {
      async decide({ key, entities }): Promise<boolean> {
        await initialize();

        return reflagClient.getFlag({ ...options, ...entities }, key).isEnabled;
      },
    };
  }

  return {
    isEnabled,
    reflagClient: async () => {
      await initialize();
      return reflagClient;
    },
  };
}

function getOrCreateDefaultAdapter() {
  if (!defaultReflagAdapter) {
    const secretKey = assertEnv('REFLAG_SECRET_KEY');

    defaultReflagAdapter = createReflagAdapter({ secretKey });
  }

  return defaultReflagAdapter;
}

/**
 * The default Reflag adapter.
 *
 * This is a convenience object that pre-initializes the Reflag SDK and provides
 * the adapter function for usage with the Flags SDK.
 *
 * This is the recommended way to use the Reflag adapter.
 *
 * ```ts
 * // flags.ts
 * import { flag } from 'flags/next';
 * import { reflagAdapter, type Context } from '@flags-sdk/reflag';
 *
 * const flag = flag<boolean, Context>({
 *   key: 'my-flag',
 *   defaultValue: false,
 *   identify: () => ({ key: "user-123" }),
 *   adapter: reflagAdapter.isEnabled(),
 * });
 * ```
 */
export const reflagAdapter: AdapterResponse = {
  isEnabled: (...args) => getOrCreateDefaultAdapter().isEnabled(...args),
  reflagClient: async () => {
    return getOrCreateDefaultAdapter().reflagClient();
  },
};

/**
 * Get the provider data for the Reflag adapter.
 *
 * This function is used the the [Flags API endpoint](https://vercel.com/docs/workflow-collaboration/feature-flags/implement-flags-in-toolbar#creating-the-flags-api-endpoint) to load and emit your Reflag data.
 *
 * ```ts
 * // .well-known/vercel/flags/route.ts
 * import { NextResponse, type NextRequest } from 'next/server';
 * import { verifyAccess, type ApiData } from 'flags';
 * import { reflagAdapter, getProviderData } from '@flags-sdk/reflag';
 *
 * export async function GET(request: NextRequest) {
 *   const access = await verifyAccess(request.headers.get('Authorization'));
 *   if (!access) return NextResponse.json(null, { status: 401 });
 *
 *   return NextResponse.json<ApiData>(
 *     await getProviderData({ reflagClient: await reflagAdapter.reflagClient() }),
 *   );
 * }
 * ```
 */
export async function getProviderData({
  reflagClient,
}: {
  /**
   * The ReflagClient instance.
   */
  reflagClient?: ReflagClient;
} = {}): Promise<ProviderData> {
  if (!reflagClient) {
    reflagClient = await getOrCreateDefaultAdapter().reflagClient();
  }

  const features = await reflagClient.getFlagDefinitions();

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
