---
'@vercel/flags-core': minor
---

Read client configuration from the datafile. The flags server can now send an optional top-level `config` field in the datafile payload (e.g. `{ "config": { "disableMetrics": true } }`). When the latest known datafile sets `config.disableMetrics: true`, the client stops recording usage events and never sends anything to the ingest endpoint. Config updates arriving at runtime (via stream or polling) take effect immediately for subsequent tracking. When `config` is absent, behavior is unchanged.
