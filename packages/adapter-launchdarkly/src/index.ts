import type { Adapter } from '@vercel/flags';
import { createClient } from '@vercel/edge-config';
import { init, type LDContext } from '@launchdarkly/vercel-server-sdk';

let defaultLaunchDarklyClient:
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

  return function launchDarklyAdapter<ValueType>(): Adapter<
    ValueType,
    LDContext
  > {
    return {
      origin(key) {
        return `https://app.launchdarkly.com/projects/${ldProject}/flags/${key}/`;
      },
      async decide({ key, entities }): Promise<ValueType> {
        await ldClient.waitForInitialization();
        return ldClient.variation(key, entities!, undefined) as ValueType;
      },
    };
  };
}

export function launchDarkly<ValueType>(): Adapter<ValueType, LDContext> {
  if (!defaultLaunchDarklyClient) {
    const edgeConfigConnectionString = assertEnv('EDGE_CONFIG');
    const ldClientSideKey = assertEnv('LD_CLIENT_SIDE_KEY');
    const ldProject = assertEnv('LD_PROJECT');
    defaultLaunchDarklyClient = createLaunchDarklyAdapter({
      ldProject,
      ldClientSideKey,
      edgeConfigConnectionString,
    });
  }

  return defaultLaunchDarklyClient();
}
