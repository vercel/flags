---
"@vercel/flags-core": minor
---

Add a header-driven `vercel` client mode that uses request config-version timestamps instead of streaming or polling. Reuse fresh definitions, refresh in the background when the request version is up to 10 seconds newer than the cached configuration, and block for a refresh when the gap is larger. Deduplicate concurrent refreshes, allow retries after fetch failures, and discard late responses after shutdown.
