---
'@flags-sdk/growthbook': major
---

The v4 adapter is removed: `growthbookAdapter`, `createGrowthbookAdapter`, `getOrCreateDefaultGrowthbookAdapter`, `resetDefaultGrowthbookAdapter` and the re-exports of `@growthbook/growthbook`, e.g. `GrowthBookClient`. The Flags SDK v5 has no adapters. Flags come from OpenFeature providers, which you give to `defineSource({ provider })`. For GrowthBook, use `@openfeature/growthbook-provider`. See https://flags-sdk.dev/docs/providers/openfeature.

`getProviderData` stays, with the same options, at `@flags-sdk/growthbook` and `@flags-sdk/growthbook/provider`: it loads the flag definitions of GrowthBook for Flags Explorer. The package no longer depends on `flags`, `@growthbook/growthbook`, `@vercel/global-config` or `@vercel/functions`. It exports the types of the data, e.g. `ProviderData`.
