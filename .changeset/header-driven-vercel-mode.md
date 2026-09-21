---
"@vercel/flags-core": minor
---

Add a header-driven `vercel` client mode that uses timestamps from the `x-vercel-flags-config-versions` or `flags-config-versions` request header instead of streaming or polling. Persist `fetchedAt` in embedded and in-memory datafiles and track when a matching version header last confirmed freshness. Reuse fresh definitions, refresh in the background when stale data was fetched or confirmed within the last 10 seconds, and block for a refresh when its freshness is older or unknown. Deduplicate concurrent refreshes, allow retries after fetch failures, and discard late responses after shutdown.
