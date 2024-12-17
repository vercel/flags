# `@flags-sdk/launchdarkly`

## Usage

**NOTE:** [The LaunchDarkly Vercel integration must be installed on our account.](https://vercel.com/integrations/launchdarkly)

The following environment variables are required in order to use the default adapter:

```sh
export EDGE_CONFIG="https://edge-config.vercel.com/ecfg_abdc1234?token=xxx-xxx-xxx" # Provided by Vercel when connecting an Edge Config to the project
export LD_CLIENT_SIDE_KEY="612376f91b8f5713a58777a1"
export LD_PROJECT_SLUG="my-project"
```

```ts
import { flag, dedupe } from '@vercel/flags/next';
import { launchDarkly, type LDContext } from '@flags-sdk/launchdarkly';

const identify = dedupe(async (): Promise<LDContext> => {
  return {
    key: 'user_123',
  };
});

export const showBanner = flag<boolean, LDContext>({
  key: 'show-banner',
  identify,
  adapter: launchDarkly(),
});
```

It's possible to create an adapter by using the `createLaunchDarklyAdapter` function:

```ts
import { createLaunchDarklyAdapter } from '@flags-sdk/launchdarkly';

const adapter = createLaunchDarklyAdapter({
  ldProject: 'my-project',
  ldClientSideKey: '612376f91b8f5713a58777a1',
  edgeConfigConnectionString: process.env.EDGE_CONFIG,
});
```
