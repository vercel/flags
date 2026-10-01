---
"@vercel/flags-core": minor
---

Add a header-driven `vercel` client mode, enabled by default when `VERCEL=1`. Initialization loads provided/bundled definitions; request versions trigger refreshes and an empty cache fetches on its first read. Explicit offline/build behavior is preserved.

An evaluation with a missing or empty version header permanently starts streaming when enabled, otherwise polling. Concurrent reads share startup and pending HTTP refreshes. Accepted stream updates and valid confirmations cancel superseded refreshes; waiting reads use the confirmed cache, and late responses cannot change cache or authorization state. Initialization and snapshot reads do not trigger this switch.

The controller supplies a source freshness-status callback to the cache and configures one shared fetch callback. HeaderSource keeps version observations; the cache handles serving, background/blocking refreshes, shared work, cancellation, and stale-if-error. The cache owns age and resets it on accepted updates or confirmations, without rewriting `fetchedAt`. Streaming becomes stale after 60 seconds and expires after 90 seconds. Polling becomes stale after its interval plus the 10-second fetch deadline and expires after two intervals plus that deadline (40/70 seconds by default). Stale evaluations refresh in the background; expired evaluations block on the shared refresh. Stream pings reset age and clear failures. Polling initialization honors its configured timeout while preserving the pending poll and interval; cached fallback does not renew cache age or stale-if-error.

Use `staleWhileRevalidate` (default 10) and `staleIfError` (default Infinity) in **seconds**, including fractions. Setting either to `0` disables its stale allowance. `staleWhileRevalidate` controls header-driven refreshes; stream/poll freshness follows their update schedules. Datafiles preserve optional `fetchedAt` epoch-millisecond timestamps across serialization and bundled/provided reuse.
