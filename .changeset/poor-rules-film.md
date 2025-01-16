---
'@vercel/flags': major
---

- **BREAKING CHANGE** removed all `unstable_` prefixes, e.g. `unstable_flag` is now `flag`
- **BREAKING CHANGE** removed `getPrecomputationContext`, use `dedupe` instead (see below)
- **BREAKING CHANGE** moved all provider functions to dedicated packages
  - `@vercel/flags/providers/launchdarkly` → `@flags-sdk/launchdarkly`
  - `@vercel/flags/providers/statsig` → `@flags-sdk/statsig`
  - `@vercel/flags/providers/split` → `@flags-sdk/split`
  - `@vercel/flags/providers/hypertune` → `@flags-sdk/hypertune`
  - `@vercel/flags/providers/optimizely` → `@flags-sdk/optimizely`
  - `@vercel/flags/providers/happykit` → `@flags-sdk/happykit`
- **BREAKING CHANGE** changed `.run({})` behavior

See [flags-sdk.com](https://flags-sdk.com/) for the latest APIs.
