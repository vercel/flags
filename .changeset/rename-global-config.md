---
'@flags-sdk/global-config': minor
'@flags-sdk/growthbook': minor
'@flags-sdk/hypertune': patch
'@flags-sdk/launchdarkly': minor
'@flags-sdk/posthog': patch
'@flags-sdk/reflag': patch
'@flags-sdk/statsig': minor
'flags': minor
---

Replace `@vercel/edge-config` with `@vercel/global-config`.

Rename the Edge Config adapter package to `@flags-sdk/global-config` and rename repository-owned Edge Config files, exports, types, options, variables, and environment variables to Global Config.

The previous Edge Config names remain available as deprecated aliases, and the previous environment variables are still honored as fallbacks, so existing code keeps working without changes.
