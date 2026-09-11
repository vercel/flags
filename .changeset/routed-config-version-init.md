---
'@vercel/flags-core': minor
---

Skip the stream or first-poll initialization wait when local flag definitions cover the routed config version, while updates continue in the background.

Read `x-vercel-edge-config-versions` from the request context, falling back to `edge-config-versions` only when the primary header is absent. Compare the first valid exact `flags_<projectId>` entry with local `configUpdatedAt`, skipping invalid matches. If no valid match exists, preserve the existing wait behavior.
