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
import { createOpenFeatureAdapter } from "@flags-sdk/openfeature";

OpenFeature.setProvider(new YourProviderOfChoice());
const openFeatureAdapter = createOpenFeatureAdapter(OpenFeature.getClient());
```

For usage with async providers, pass an init function, and return the client:

```ts
import { createOpenFeatureAdapter } from "@flags-sdk/openfeature";

// pass an init function, and return the client
const openFeatureAdapter = createOpenFeatureAdapter(async () => {
  const provider = new YourProviderOfChoice();
  await OpenFeature.setProviderAndWait(provider);
  return OpenFeature.getClient();
});
```

## Shutdown

Call `close()` to revert the adapter to its uninitialized state. The next flag evaluation initializes it again, which re-runs the `init` function you passed in. Any initialization still in flight is awaited first, and calling `close()` repeatedly without an intervening evaluation does nothing further.

Pass `onClose` to dispose of whatever your `init` function set up. The adapter can not do this for you: an OpenFeature client can not be closed on its own, and shutting down providers means closing them on the global `OpenFeature` API, which would also affect providers this adapter never registered.

```ts
const openFeatureAdapter = createOpenFeatureAdapter(
  async () => {
    await OpenFeature.setProviderAndWait(new YourProviderOfChoice());
    return OpenFeature.getClient();
  },
  { onClose: () => OpenFeature.close() },
);

await openFeatureAdapter.close();
```

Note that when you pass a client directly instead of an `init` function, the adapter has nothing to re-create, so evaluations after a `close()` keep using that same client.

## Documentation

Please check out the [OpenFeature provider documentation](https://flags-sdk.dev/docs/api-reference/adapters/openfeature) for more information.
