import type { Adapter } from 'flags';
import { createClient } from '@vercel/edge-config';
import {
  init,
  LDClient,
  type LDContext,
} from '@launchdarkly/vercel-server-sdk';

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
  const ldClient = init(clientSideId, edgeConfigClient);

  function origin(key: string) {
    return `https://app.launchdarkly.com/projects/${projectSlug}/flags/${key}/`;
  }

  function variation<ValueType>(
    options: AdapterOptions<ValueType> = {},
  ): Adapter<ValueType, LDContext> {
    return {
      origin,
      async decide({ key, entities }): Promise<ValueType> {
        await ldClient.waitForInitialization();
        return ldClient.variation(
          key,
          entities as LDContext,
          options.defaultValue,
        ) as ValueType;
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

/**
/**
 * This is the previous name for the LaunchDarkly adapter.
 *
 * @deprecated Use `ldAdapter` instead.
 */
export const launchDarkly = ldAdapter;
