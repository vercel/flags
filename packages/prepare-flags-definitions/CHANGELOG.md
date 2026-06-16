# @vercel/prepare-flags-definitions

## 0.3.0

### Minor Changes

- [#390](https://github.com/vercel/flags/pull/390) [`7b5ea9a`](https://github.com/vercel/flags/commit/7b5ea9a808dfd4155bd2bbf321c3b44ec730cda6) Thanks [@luismeyer](https://github.com/luismeyer)! - Add OIDC authentication support for Vercel Flags clients and generated flag definitions.

  `@vercel/flags-core` can now create clients without an SDK key and authenticate with a Vercel OIDC token, while still supporting SDK keys and connection strings. Bundled definitions can be looked up by SDK key hash or OIDC project ID.

  `@vercel/prepare-flags-definitions` now collects both SDK keys and `VERCEL_OIDC_TOKEN`, fetches definitions for each auth entry, deduplicates identical definitions across SDK keys and OIDC project IDs, and writes generated maps keyed by SDK key hash or project ID.

  `@flags-sdk/vercel` now supports provider data lookup for Vercel flag origins that do not include an SDK key, allowing OIDC-backed clients to resolve project metadata.

## 0.2.1

### Patch Changes

- b755ffe: Fix SDK key detection to avoid false positives with third-party identifiers.

  The SDK key validation now uses a regex to require the format `vf_server_*` or `vf_client_*` instead of accepting any string starting with `vf_`. This prevents false positives with third-party service identifiers that happen to start with `vf_` (e.g., Stripe identity flow IDs like `vf_1PyHgVLpWuMxVFx...`).

## 0.2.0

### Minor Changes

- 05a5ebf: accept userAgentSuffix instead of version
- 10c10b6: Return meaningful result from `prepareFlagsDefinitions` indicating whether definitions were created or skipped

## 0.1.0

### Minor Changes

- 96ba122: Initial release of `@vercel/prepare-flags-definitions`. Extracts the core flag definitions preparation logic from the Vercel CLI into a standalone, reusable package.
