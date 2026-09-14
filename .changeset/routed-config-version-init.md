---
'@vercel/flags-core': minor
---

Use request-driven `pushVersion` updates when a routed config version applies to the client, instead of opening a stream or polling periodically.

Read `x-vercel-edge-config-versions` from the request context, falling back to `edge-config-versions` only when the primary header is absent. Compare the first valid exact `flags_<projectId>` entry with local `configUpdatedAt` on each read. Current definitions require no fetch; a version gap under 10 seconds triggers a background datafile fetch, while a gap of at least 10 seconds (or an unknown local timestamp) blocks on refresh. Fetches forward `X-Config-Min-Updated-At`, share in-flight work, and retain last-known definitions on failure.

When no usable project entry is present, retain or resume the existing stream/poll behavior. Build and explicit offline modes are unchanged. Metrics expose the new `pushVersion` mode.
