---
"@vercel/flags-core": minor
---

Add a header-driven `vercel` client mode that uses timestamps from the `x-vercel-flags-config-versions` or `flags-config-versions` request header instead of streaming or polling. Configure `staleWhileRevalidate` (default 60 seconds) and `staleIfError` (default 3600 additional seconds) when creating the client. These options apply to header-driven refreshes; regular streaming and polling retain their existing cache behavior.

Measure freshness from the cached configuration's last accepted fetch or matching-header observation, never its configuration timestamp. Refresh in the background within `staleWhileRevalidate`, otherwise block; after refresh failure, `staleIfError` extends the stale-serving window. Setting either option to `0` disables its corresponding window. Bundled and provided definitions start with unknown freshness. Older matching headers cannot renew freshness after a newer version has been observed.

Vercel initialization performs no I/O. Headerless reads serve cached data, fetching only when empty, and disabling both streaming and polling preserves offline mode. Share concurrent refreshes while honoring each read's version requirement, catch up to newer observed versions, bound retries with backoff and a deadline, and discard late responses after shutdown.
