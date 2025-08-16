import type { Adapter } from 'flags';
import { createClient, type EdgeConfigClient } from '@vercel/edge-config';
import {
  init,
  LDClient,
  type LDContext,
} from '@launchdarkly/vercel-server-sdk';
import { AsyncLocalStorage } from 'async_hooks';

export { getProviderData } from './provider';
export type { LDContext };

interface AdapterOptions<ValueType> {
  defaultValue?: ValueType;
}

type AdapterResponse = {
  variation: <ValueType>(
    options?: AdapterOptions<ValueType>,
  ) => Adapter<ValueType, LDContext>;
  /** The LaunchDarkly client instance used by the adapter. */
  ldClient: LDClient;
};

let defaultLaunchDarklyAdapter:
  | ReturnType<typeof createLaunchDarklyAdapter>
  | undefined;

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `LaunchDarkly Adapter: Missing ${name} environment variable`,
    );
  }
  return value;
}

export function createLaunchDarklyAdapter({
  projectSlug,
  clientSideId,
  edgeConfigConnectionString,
}: {
  projectSlug: string;
  clientSideId: string;
  edgeConfigConnectionString: string;
}): AdapterResponse {
  const edgeConfigClient = createClient(edgeConfigConnectionString);

  const store = new AsyncLocalStorage<WeakKey>();
  const cache = new WeakMap<WeakKey, Promise<unknown>>();

  const patchedEdgeConfigClient: EdgeConfigClient = {
    ...edgeConfigClient,
    get: async <T>(key: string) => {
      const h = store.getStore();
      if (h) {
        const cached = cache.get(h);
        if (cached) {
          return cached as Promise<T>;
        }
      }

      console.log('reading edge config');
      const before = performance.now();
      const promise = edgeConfigClient.get<T>(key);
      if (h) cache.set(h, promise);
      await promise;
      const after = performance.now();
      console.log('edge config read', after - before);
      return promise;
    },
  };

  let initPromise: Promise<unknown> | null = null;

  const before = performance.now();
  const ldClient = init(clientSideId, patchedEdgeConfigClient);
  const after = performance.now();
  console.log('init', after - before);

  function origin(key: string) {
    return `https://app.launchdarkly.com/projects/${projectSlug}/flags/${key}/`;
  }

  function variation<ValueType>(
    options: AdapterOptions<ValueType> = {},
  ): Adapter<ValueType, LDContext> {
    return {
      origin,
      async decide({ key, entities, headers }): Promise<ValueType> {
        if (!ldClient.initialized()) {
          if (!initPromise) initPromise = ldClient.waitForInitialization();
          await initPromise;
        }

        return store.run(headers, () => {
          return ldClient.variation(
            key,
            entities as LDContext,
            options.defaultValue,
          ) as ValueType;
        });
      },
    };
  }

  return {
    ldClient,
    variation,
  };
}

function getOrCreateDeaultAdapter() {
  if (!defaultLaunchDarklyAdapter) {
    const edgeConfigConnectionString = assertEnv('EDGE_CONFIG');
    const clientSideId = assertEnv('LAUNCHDARKLY_CLIENT_SIDE_ID');
    const projectSlug = assertEnv('LAUNCHDARKLY_PROJECT_SLUG');

    defaultLaunchDarklyAdapter = createLaunchDarklyAdapter({
      projectSlug,
      clientSideId,
      edgeConfigConnectionString,
    });
  }

  return defaultLaunchDarklyAdapter;
}

/**
 * The default LaunchDarkly adapter.
 *
 * This is a convenience object that pre-initializes the LaunchDarkly SDK and provides
 * the adapter function for usage with the Flags SDK.
 *
 * This is the recommended way to use the LaunchDarkly adapter.
 *
 * ```ts
 * // flags.ts
 * import { flag } from 'flags/next';
 * import { ldAdapter, type LDContext } from '@flags-sdk/launchdarkly';
 *
 * const flag = flag<boolean, LDContext>({
 *   key: 'my-flag',
 *   defaultValue: false,
 *   identify: () => ({ key: "user-123" }),
 *   adapter: ldAdapter.variation(),
 * });
 * ```
 */
export const ldAdapter: AdapterResponse = {
  variation: (...args) => getOrCreateDeaultAdapter().variation(...args),
  get ldClient() {
    return getOrCreateDeaultAdapter().ldClient;
  },
};
