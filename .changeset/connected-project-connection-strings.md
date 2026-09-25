---
'@vercel/flags-core': minor
'@flags-sdk/vercel': minor
---

Support `flags:projectId=<id>` connection strings. The client authenticates with the deployment's OIDC token and sends `X-Vercel-Flags-Project-Id` on datafile, stream, and ingest requests. Bundled definitions are looked up by that project id. A connection string with both `sdkKey` and `projectId`, or with a malformed `projectId`, is rejected. The client's `origin` includes `projectId` for these connection strings, and `getProviderData` uses it directly.
