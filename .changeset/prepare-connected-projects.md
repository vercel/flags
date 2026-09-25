---
'@vercel/prepare-flags-definitions': minor
---

Embed definitions for `flags:projectId=<id>` connection strings found in the environment. They are fetched with `VERCEL_OIDC_TOKEN` and `X-Vercel-Flags-Project-Id`, and stored under the project id. Skipped when no OIDC token is available, and values that also carry an `sdkKey` are ignored.
