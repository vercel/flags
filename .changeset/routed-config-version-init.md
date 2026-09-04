---
'@vercel/flags-core': minor
---

Skip waiting for a stream confirmation or first poll when the loaded flag definitions already cover the config version the request was routed to.

The `x-vercel-edge-config-versions` request header carries a semicolon-separated map of store name to version. The client reads it from the existing Vercel request context, looks up the `flags_<projectId>` entry derived from the loaded definitions, and — when the local `configUpdatedAt` is at or ahead of that version — resolves `initialize()` right away while the stream or poll keeps updating in the background. No new header or config id is involved.

Everything else keeps the previous behavior: a missing request context, a project without an entry, a malformed or unsafe version, a duplicated entry, or definitions without a usable `configUpdatedAt` all wait for the stream or first poll as before. The client never reports a connection before it exists, and background updates still cannot replace newer definitions with equal or older ones.
