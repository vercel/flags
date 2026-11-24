# `@flags-sdk/flagsmith`

Loads the flag definitions of [Flagsmith](https://www.flagsmith.com) for Flags Explorer.

## Installation

```bash
npm install @flags-sdk/flagsmith
```

## Flags Explorer metadata

```ts
import { getProviderData } from "@flags-sdk/flagsmith";

const data = await getProviderData({
  // Your Flagsmith server-side environment key
  environmentKey: process.env.FLAGSMITH_ENVIRONMENT_KEY!,
  // Your Flagsmith project ID, for the links to the dashboard
  projectId: process.env.FLAGSMITH_PROJECT_ID!,
});
```

`getProviderData` returns `{ definitions, hints }`, the data which [Flags Explorer](https://vercel.com/docs/feature-flags/flags-explorer) reads from the endpoint `/.well-known/vercel/flags`. The definitions contain the description, the options and a link to the dashboard of each flag. When the request fails or an option is missing, `definitions` is empty and `hints` tells why.

`getProviderData` exists only for compatibility with the old endpoint `/.well-known/vercel/flags` of Flags Explorer, which the Flags SDK v5 no longer creates. Flags Explorer cannot yet load this metadata from a provider itself. Until it can, an application which wants the metadata in Flags Explorer serves the result of `getProviderData` from that endpoint. After that, `getProviderData` is no longer needed.

## Upgrading from v4

The v4 adapter (`flagsmithAdapter`, `createFlagsmithAdapter`) is removed. The Flags SDK v5 has no adapters: flags come from [OpenFeature providers](https://flags-sdk.dev/docs/providers/openfeature), which you give to `defineSource({ provider })`. For Flagsmith, use its OpenFeature server provider. Find it in the [OpenFeature ecosystem](https://openfeature.dev/ecosystem).

The re-exported types of `@flagsmith/nodejs`, e.g. `FlagsmithConfig`, are removed too. Import them from `@flagsmith/nodejs`.

`getProviderData` stays, with the same options. The package no longer depends on `flags`.
