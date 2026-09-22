---
"@vercel/flags-core": minor
"@vercel/prepare-flags-definitions": patch
---

Add header-driven cache invalidation on Vercel, with lazy initialization and shared, bounded revalidation that honors each concurrent read's required version. Headerless reads use cache, fetching only if empty; disabling streaming and polling retains offline behavior.

Add `staleWhileRevalidate` (default 60 seconds) and `staleIfError` (default `Infinity`) across header, polling, and streaming refreshes. Finite error windows extend SWR; expired reads use evaluation defaults or throw. Freshness follows fetch/confirmation time, never configuration age.

Expose optional `fetchedAt` (Unix milliseconds), preserve it through datafile reads and client creation, and record it in generated bundles. Loading bundled/provided data retains its original age; missing timestamps remain supported.
