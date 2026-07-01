---
'@flags-sdk/launchdarkly': minor
---

Support the native LaunchDarkly Marketplace integration.

**Breaking changes:**

- The adapter now reads the Edge Config connection string from `EXPERIMENTATION_CONFIG` first, falling back to `EDGE_CONFIG` for the legacy Vercel integration. If both are set to different values, `EXPERIMENTATION_CONFIG` now takes precedence. The error thrown when neither is set changed to `LaunchDarkly Adapter: Missing EXPERIMENTATION_CONFIG or EDGE_CONFIG environment variable`.
- `LAUNCHDARKLY_PROJECT_SLUG` / `projectSlug` is now optional. It is only used to deep-link flags to the LaunchDarkly dashboard. When it is not set, flag evaluation is unaffected, but `variation().origin` is now `undefined` instead of always being a function.
