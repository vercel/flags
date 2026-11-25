---
'@flags-sdk/flagsmith': major
---

The v4 adapter is removed: `flagsmithAdapter`, `createFlagsmithAdapter` and the re-exported types of `@flagsmith/nodejs`. The Flags SDK v5 has no adapters. Flags come from OpenFeature providers, which you give to `defineSource({ provider })`. See https://flags-sdk.dev/docs/providers/openfeature.

`getProviderData` stays, with the same options: it loads the flag definitions of Flagsmith for Flags Explorer. It exists only for compatibility with the old endpoint `/.well-known/vercel/flags` of Flags Explorer, until Flags Explorer can load this metadata from providers itself. The package no longer depends on `flags` or `@flagsmith/nodejs`. It exports the types of the data, e.g. `ProviderData`.
