---
"@vercel/flags-core": minor
---

Add a header-driven `vercel` client mode that uses timestamps from the `x-vercel-flags-config-versions` or `flags-config-versions` request header instead of streaming or polling. Reuse fresh definitions, refresh in the background for up to `staleWhileRevalidateMs` (10 seconds by default) since the cached configuration was last successfully fetched or confirmed by a matching request header, and block for a refresh when that freshness expires or is unknown. Set `staleWhileRevalidateMs` to `0` to disable stale serving. Freshness metadata is runtime-only; bundled and provided definitions start with unknown age. Deduplicate concurrent refreshes, allow retries after fetch failures, and discard late responses after shutdown.
