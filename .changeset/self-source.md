---
'flags': minor
'@flags-sdk/next': minor
'@flags-sdk/vite': minor
'@flags-sdk/sveltekit': minor
'@flags-sdk/tanstack-start': minor
'@flags-sdk/nuxt': minor
---

The default source `self`: in an application which depends on `@vercel/flags-core`, the flags of the source `self` in the flags files use `new VercelProvider()`, without `flags/sources/self/`. Each file of `flags/sources/self/` replaces its part, e.g. `context.ts` adds an evaluation context and `provider.ts` replaces the provider. `"selfSource": false` in `flags/config.json` turns it off, for the plugins, the CLI and the compiler of the flags files.
