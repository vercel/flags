# `@flags-sdk/launchdarkly`

Loads the flag definitions of [LaunchDarkly](https://launchdarkly.com) for Flags Explorer.

## Installation

```bash
npm install @flags-sdk/launchdarkly
```

## Flags Explorer metadata

```ts
import { getProviderData } from "@flags-sdk/launchdarkly";

const data = await getProviderData({
  // A LaunchDarkly API access token with read access to the flags
  apiKey: process.env.LAUNCHDARKLY_API_KEY!,
  projectKey: process.env.LAUNCHDARKLY_PROJECT_KEY!,
  environment: process.env.LAUNCHDARKLY_ENVIRONMENT!,
});
```

`getProviderData` returns `{ definitions, hints }`, the data which [Flags Explorer](https://vercel.com/docs/feature-flags/flags-explorer) reads from the endpoint `/.well-known/vercel/flags`. The definitions contain the description, the options and a link to the dashboard of each flag. When the request fails or an option is missing, `definitions` is empty and `hints` tells why.

`getProviderData` exists only for compatibility with the old endpoint `/.well-known/vercel/flags` of Flags Explorer, which the Flags SDK v5 no longer creates. Flags Explorer cannot yet load this metadata from a provider itself. Until it can, an application which wants the metadata in Flags Explorer serves the result of `getProviderData` from that endpoint. After that, `getProviderData` is no longer needed.

## Upgrading from v4

The v4 adapter (`ldAdapter`, `createLaunchDarklyAdapter`) is removed. The Flags SDK v5 has no adapters: flags come from [OpenFeature providers](https://flags-sdk.dev/docs/providers/openfeature), which you give to `defineSource({ provider })`. For LaunchDarkly, use its OpenFeature server provider, see [LaunchDarkly](https://flags-sdk.dev/docs/providers/openfeature#launchdarkly).

The re-exported type `LDContext` is removed too. Import it from the SDK of LaunchDarkly.

`getProviderData` stays, with the same options. The package no longer depends on `flags`.
