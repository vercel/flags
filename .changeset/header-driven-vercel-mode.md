---
"@vercel/flags-core": minor
---

Add a header-driven `vercel` client mode, enabled by default when `VERCEL=1`. Initialization loads provided/bundled definitions; request versions trigger refreshes and an empty cache fetches on its first read. Explicit offline/build behavior is preserved.

An evaluation with a missing or empty version header permanently starts streaming when enabled, otherwise polling. Concurrent reads share startup, and pending header refreshes are cancelled without losing cached data or resetting stale-if-error. Initialization and snapshot reads do not trigger this switch.

The controller supplies a source freshness-status callback and optional fetch callback to the cache. HeaderSource keeps version observations; the cache handles serving, background/blocking refreshes, shared work, cancellation, and stale-if-error. The cache owns age and resets it on accepted updates or confirmations, without rewriting `fetchedAt`. Polling becomes stale after its interval, streaming after 30 seconds; stream pings reset age without clearing or extending a stale-if-error failure. Source schedules stay unchanged.

Use `staleWhileRevalidate` (default 10) and `staleIfError` (default Infinity) in **seconds**, including fractions. Setting either to `0` disables its stale allowance. Datafiles preserve optional `fetchedAt` epoch-millisecond timestamps across serialization and bundled/provided reuse.
