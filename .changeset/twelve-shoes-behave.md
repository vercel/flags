---
"@flags-sdk/vercel": minor
"@vercel/prepare-flags-definitions": minor
"@vercel/flags-core": minor
---

Add OIDC authentication support for Vercel Flags clients and generated flag definitions.

`@vercel/flags-core` can now create clients without an SDK key and authenticate with a Vercel OIDC token, while still supporting SDK keys and connection strings. Bundled definitions can be looked up by SDK key hash or OIDC project ID.

`@vercel/prepare-flags-definitions` now collects both SDK keys and `VERCEL_OIDC_TOKEN`, fetches definitions for each auth entry, deduplicates identical definitions across SDK keys and OIDC project IDs, and writes generated maps keyed by SDK key hash or project ID.

`@flags-sdk/vercel` now supports provider data lookup for Vercel flag origins that do not include an SDK key, allowing OIDC-backed clients to resolve project metadata.
