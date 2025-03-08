# Flags SDK - LaunchDarkly Provider

The [LaunchDarkly provider](https://flags-sdk.dev/docs/api-reference/adapters/launchdarkly) for the [Flags SDK](https://flags-sdk.dev/) contains support for LaunchDarkly's Feature Flags.

## Setup

The Statsig provider is available in the `@flags-sdk/statsig` module. You can install it with

```bash
npm i @flags-sdk/launchdarkly
```

## Provider Instance

**NOTE:** The [LaunchDarkly Vercel integration](https://vercel.com/integrations/launchdarkly) must be installed on your account, as this adapter loads LaunchDarkly from Edge Config. The adapter can not be used without Edge Config.

Import the default adapter instance `ldAdapter` from `@flags-sdk/launchdarkly`:

```ts
import { ldAdapter } from '@flags-sdk/launchdarkly';
```

The default adapter uses the following environment variables to configure itself:

```sh
export LAUNCHDARKLY_CLIENT_SIDE_ID="612376f91b8f5713a58777a1"
export LAUNCHDARKLY_PROJECT_SLUG="my-project"
# Provided by Vercel when connecting an Edge Config to the project
export EDGE_CONFIG="https://edge-config.vercel.com/ecfg_abdc1234?token=xxx-xxx-xxx"
```

## Example

```ts
import { flag, dedupe } from 'flags/next';
import { ldAdapter, type LDContext } from '@flags-sdk/launchdarkly';

const identify = dedupe(async (): Promise<LDContext> => {
  return {
    key: 'user_123',
  };
});

export const showBanner = flag<boolean, LDContext>({
  key: 'show-banner',
  identify,
  adapter: ldAdapter(),
});
```

## Custom Adapter

Create an adapter by using the `createLaunchDarklyAdapter` function:

```ts
import { createLaunchDarklyAdapter } from '@flags-sdk/launchdarkly';

const adapter = createLaunchDarklyAdapter({
  projectSlug: 'my-project',
  ldClientSideKey: '612376f91b8f5713a58777a1',
  edgeConfigConnectionString: process.env.EDGE_CONFIG,
});
```

## Documentation

Please check out the [LaunchDarkly provider documentation](https://flags-sdk.dev/docs/api-reference/adapters/launchdarkly) for more information.
