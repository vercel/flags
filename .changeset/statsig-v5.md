---
'@flags-sdk/statsig': major
---

The v4 adapter is removed: `statsigAdapter`, `createStatsigAdapter`, `createDefaultStatsigAdapter`, `resetDefaultStatsigAdapter`, the re-exports of `statsig-node-lite` (`Statsig`, `StatsigUser`, `StatsigOptions`, `DynamicConfig`, `Layer`), the type `FeatureGate`, and the Global Config data adapter of `statsig-node-vercel`. The Flags SDK v5 has no adapters. Flags come from OpenFeature providers, which you give to `defineSource({ provider })`. Use `StatsigProvider` of `@flags-sdk/statsig/openfeature`. See https://flags-sdk.dev/docs/providers/openfeature.

`StatsigProvider` and `getProviderData` stay. `getProviderData` loads the definitions of Statsig for Flags Explorer, with the same options, at `@flags-sdk/statsig` and `@flags-sdk/statsig/provider`. It exists only for compatibility with the old endpoint `/.well-known/vercel/flags` of Flags Explorer, until Flags Explorer can load this metadata from providers itself. The package no longer depends on `flags`, `statsig-node-lite`, `statsig-node-vercel`, `@vercel/global-config` or `@vercel/functions`. It exports the types of the data, e.g. `ProviderData`.
