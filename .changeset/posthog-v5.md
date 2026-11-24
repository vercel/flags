---
'@flags-sdk/posthog': major
---

The v4 adapter is removed: `postHogAdapter`, `createPostHogAdapter`, `resetDefaultPostHogAdapter` and the types `PostHogEntities` and `JsonType`. The Flags SDK v5 has no adapters. Flags come from OpenFeature providers, which you give to `defineSource({ provider })`. Use `PostHogProvider` of `@flags-sdk/posthog/openfeature`. See https://flags-sdk.dev/docs/providers/openfeature.

`PostHogProvider` and `getProviderData` stay. `getProviderData` loads the flag definitions of PostHog for Flags Explorer, with the same options. It exists only for compatibility with the old endpoint `/.well-known/vercel/flags` of Flags Explorer, until Flags Explorer can load this metadata from providers itself. The package no longer depends on `flags` or `posthog-node`: the application creates the client of `posthog-node` for the provider. It exports the types of the data, e.g. `ProviderData`.
