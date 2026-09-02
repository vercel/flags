---
'@vercel/flags-core': patch
---

Forward a minimum config freshness requirement when the Vercel Edge Network advertises a newer flag configuration than the one held in memory.

The `x-vercel-edge-config-versions` request header carries the last known update timestamp of a project's flag configuration under the `flags_<projectId>` key. When that timestamp is newer than the in-memory data, the client now sends `X-Config-Min-Updated-At` on datafile fetches and stream connections, and reports its current `configUpdatedAt` as `X-Config-Updated-At` on stream connections. `X-Revision` is unchanged.

A response that does not meet the minimum no longer resolves initialization as fresh: `initialize()` keeps waiting for satisfying data and then falls back to the existing data, which is reported with `cacheStatus: 'STALE'`. The requirement is re-read per `initialize()`/`read()`/`getDatafile()` call so long-lived clients pick up newer requirements on later requests, is monotonic (an older header never downgrades it), and triggers at most one deduplicated background refresh per client per requirement. Build-step and non-Vercel behavior is unchanged.
