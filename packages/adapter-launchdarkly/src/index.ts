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
}): {
  <ValueType>(
    options?: AdapterOptions<ValueType>,
  ): Adapter<ValueType, LDContext>;
  /** The LaunchDarkly client instance used by the adapter. */
  ldClient: LDClient;
} {
  const edgeConfigClient = createClient(edgeConfigConnectionString);
  const ldClient = init(clientSideId, edgeConfigClient);

  const launchDarklyAdapter = function launchDarklyAdapter<ValueType>(
    options: AdapterOptions<ValueType> = {},
  ): Adapter<ValueType, LDContext> {
    return {
      origin(key) {
        return `https://app.launchdarkly.com/projects/${projectSlug}/flags/${key}/`;
      },
      async decide({ key, entities }): Promise<ValueType> {
        await ldClient.waitForInitialization();
        return ldClient.variation(
          key,
          entities as LDContext,
          options.defaultValue,
        ) as ValueType;
      },
    };
  };

  launchDarklyAdapter.ldClient = ldClient;

  return launchDarklyAdapter;
}

export function ldAdapter<ValueType>(
  options?: AdapterOptions<ValueType>,
): Adapter<ValueType, LDContext> {
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

  return defaultLaunchDarklyAdapter(options);
}

/**
 * This is the previous name for the LaunchDarkly adapter.
 *
 * @deprecated Use `ldAdapter` instead.
 */
export const launchDarkly = ldAdapter;
