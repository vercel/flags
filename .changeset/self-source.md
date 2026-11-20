---
'flags': minor
'@flags-sdk/next': minor
'@flags-sdk/vite': minor
'@flags-sdk/sveltekit': minor
'@flags-sdk/tanstack-start': minor
'@flags-sdk/nuxt': minor
---

The default source `self`: an application which depends on `@vercel/flags-core` can import the flags of its Vercel project from `flags:self`, without `flags/sources/self/`. The code generation uses `new VercelProvider()` and the catalog of `@vercel/flags-core/catalog`. Each file of `flags/sources/self/` replaces its part, e.g. `context.ts` adds an evaluation context. `disableSelfSource: true` in the plugin, or `--disable-self-source` for `flags sync` and `flags watch`, turns it off. If the flags can not be loaded, e.g. without `vercel env pull`, `flags:self` has no flags and the SDK warns.
