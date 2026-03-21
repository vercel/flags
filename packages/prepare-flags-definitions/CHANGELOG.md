# @vercel/prepare-flags-definitions

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
