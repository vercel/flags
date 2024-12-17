import type { Adapter } from '@vercel/flags';
import { createClient } from '@vercel/edge-config';
import { init, type LDContext } from '@launchdarkly/vercel-server-sdk';

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
  ldProject,
  ldClientSideKey,
  edgeConfigConnectionString,
}: {
  ldProject: string;
  ldClientSideKey: string;
  edgeConfigConnectionString: string;
}) {
  const edgeConfigClient = createClient(edgeConfigConnectionString);
  const ldClient = init(ldClientSideKey, edgeConfigClient);

  return function launchDarklyAdapter<ValueType>(
    options: AdapterOptions<ValueType> = {},
  ): Adapter<ValueType, LDContext> {
    return {
      origin(key) {
        return `https://app.launchdarkly.com/projects/${ldProject}/flags/${key}/`;
      },
      async decide({ key, entities, defaultValue }): Promise<ValueType> {
        await ldClient.waitForInitialization();
        return ldClient.variation(
          key,
          entities!,
          options.defaultValue ?? defaultValue,
        ) as ValueType;
      },
    };
  };
}

export function launchDarkly<ValueType>(
  options?: AdapterOptions<ValueType>,
): Adapter<ValueType, LDContext> {
  if (!defaultLaunchDarklyAdapter) {
    const edgeConfigConnectionString = assertEnv('EDGE_CONFIG');
    const ldClientSideKey = assertEnv('LD_CLIENT_SIDE_KEY');
    const ldProject = assertEnv('LD_PROJECT_SLUG');
    defaultLaunchDarklyAdapter = createLaunchDarklyAdapter({
      ldProject,
      ldClientSideKey,
      edgeConfigConnectionString,
    });
  }

  return defaultLaunchDarklyAdapter(options);
}
