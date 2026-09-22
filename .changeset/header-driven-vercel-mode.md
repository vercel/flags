---
"@vercel/flags-core": minor
"@vercel/prepare-flags-definitions": patch
---

Flag updates on Vercel can now reach your application on the next request, without waiting for a polling interval or maintaining a streaming connection. When streaming or polling is enabled, the client automatically uses Vercel's request headers to detect changes. Concurrent reads share refreshes, avoiding duplicate requests and unnecessary waiting.

Choose how to balance fast evaluations with fresh configuration using `staleWhileRevalidate` (default `60` seconds) and `staleIfError` (default `Infinity`). These options work across Vercel, polling, and streaming. By default, your application can keep using its last available flags during an outage. Set a finite `staleIfError` to limit fallback beyond the stale-while-revalidate window; once that window expires, evaluations use supplied defaults or throw.

Bundled and saved configurations can participate in these freshness windows immediately, even if the initial connection fails. Their optional `fetchedAt` timestamp is preserved when loading or reusing data, so deploying an old bundle does not make it appear freshly fetched. Existing bundles without a timestamp remain supported, and offline mode continues to serve cached flags without refreshing.
