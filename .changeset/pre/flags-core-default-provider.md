---
'@vercel/flags-core': minor
---

Add the subpath `@vercel/flags-core/default-provider`. It exports `createDefaultProvider()`, which returns a `VercelProvider`. A framework or a platform can use it as a bundler alias of `flags/default-provider`, so that flags of the Flags SDK without a connection use Vercel Flags.
