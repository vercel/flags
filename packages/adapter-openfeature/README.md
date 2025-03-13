# Flags SDK - OpenFeature Provider

OpenFeature is an open specification that provides a vendor-agnostic, community-driven API for feature flagging that works with your favorite feature flag management tool or in-house solution. The Flags SDK OpenFeature adapter allows you to use the Flags SDK with any OpenFeature provider.

## Setup

The OpenFeature provider is available in the `@flags-sdk/openfeature` module. Install it with

```sh
npm i @flags-sdk/openfeature @openfeature/server-sdk
```

The command also installs the @openfeature/server-sdk peer dependency, as the OpenFeature adapter depends on the OpenFeature Node.js SDK.

## Provider Instance

Import the `createOpenFeatureAdapter` function from `@flags-sdk/openfeature` and create an adapter instance with your OpenFeature client.

For usage with regular providers, pass the client directly:

```ts
import { createOpenFeatureAdapter } from '@flags-sdk/openfeature';

OpenFeature.setProvider(new YourProviderOfChoice());
const openFeatureAdapter = createOpenFeatureAdapter(OpenFeature.getClient());
```

For usage with async providers, pass an init function, and return the client:

```ts
import { createOpenFeatureAdapter } from '@flags-sdk/openfeature';

// pass an init function, and return the client
const openFeatureAdapter = createOpenFeatureAdapter(async () => {
  const provider = new YourProviderOfChoice();
  await OpenFeature.setProviderAndWait(provider);
  return OpenFeature.getClient();
});
```

## Documentation

Please check out the [OpenFeature provider documentation](https://flags-sdk.dev/docs/api-reference/adapters/openfeature) for more information.
