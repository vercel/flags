# `@flags-sdk/growthbook`

Loads the flag definitions of [GrowthBook](https://www.growthbook.io) for Flags Explorer.

## Installation

```bash
npm install @flags-sdk/growthbook
```

## Flags Explorer metadata

```ts
import { getProviderData } from "@flags-sdk/growthbook";

const data = await getProviderData({
  // A GrowthBook API key or personal access token
  apiKey: process.env.GROWTHBOOK_API_KEY!,
  // Optional: only the features of this SDK connection
  clientKey: process.env.GROWTHBOOK_CLIENT_KEY,
  // Optional, for self-hosted GrowthBook
  // appApiHost: "https://api.example.com",
  // appOrigin: "https://app.example.com",
});
```

`getProviderData` is also available from `@flags-sdk/growthbook/provider`.

`getProviderData` returns `{ definitions, hints }`, the data which [Flags Explorer](https://vercel.com/docs/feature-flags/flags-explorer) reads from the endpoint `/.well-known/vercel/flags`. The definitions contain the description, the options and a link to the dashboard of each flag. When the request fails or an option is missing, `definitions` is empty and `hints` tells why.

`getProviderData` exists only for compatibility with the old endpoint `/.well-known/vercel/flags` of Flags Explorer, which the Flags SDK v5 no longer creates. Flags Explorer cannot yet load this metadata from a provider itself. Until it can, an application which wants the metadata in Flags Explorer serves the result of `getProviderData` from that endpoint. After that, `getProviderData` is no longer needed.

## Upgrading from v4

The v4 adapter (`growthbookAdapter`, `createGrowthbookAdapter`) is removed. The Flags SDK v5 has no adapters: flags come from [OpenFeature providers](https://flags-sdk.dev/docs/providers/openfeature), which you give to `defineSource({ provider })`. For GrowthBook, use `@openfeature/growthbook-provider`, see [GrowthBook](https://flags-sdk.dev/docs/providers/openfeature#growthbook).

The re-exports of `@growthbook/growthbook`, e.g. `GrowthBookClient`, are removed too. Import them from `@growthbook/growthbook`.

`getProviderData` stays, with the same options. The package no longer depends on `flags`.
