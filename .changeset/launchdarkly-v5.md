---
'@flags-sdk/launchdarkly': major
---

The v4 adapter is removed: `ldAdapter`, `createLaunchDarklyAdapter` and the re-exported type `LDContext`. The Flags SDK v5 has no adapters. Flags come from OpenFeature providers, which you give to `defineSource({ provider })`. For LaunchDarkly, use its OpenFeature server provider. See https://flags-sdk.dev/docs/providers/openfeature.

`getProviderData` stays, with the same options: it loads the flag definitions of LaunchDarkly for Flags Explorer. The package no longer depends on `flags`, `@launchdarkly/vercel-server-sdk` or `@vercel/global-config`. It exports the types of the data, e.g. `ProviderData`.
