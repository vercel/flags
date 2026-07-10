---
'@flags-sdk/launchdarkly': major
---

Support the native LaunchDarkly Marketplace integration.

**Breaking changes:**

- The default adapter (`ldAdapter`) now reads the Edge Config connection string from the `EXPERIMENTATION_CONFIG` environment variable instead of `EDGE_CONFIG`. This aligns with the native LaunchDarkly Marketplace integration and matches the behavior of other adapters (e.g. Statsig). `EDGE_CONFIG` is no longer read by the default adapter. The error thrown when `EXPERIMENTATION_CONFIG` is not set changed to `LaunchDarkly Adapter: Missing EXPERIMENTATION_CONFIG environment variable`.

  **If you use the legacy LaunchDarkly Vercel integration** (which provides the connection string as `EDGE_CONFIG`), pass the connection string explicitly with `createLaunchDarklyAdapter`:

  ```ts
  import { createLaunchDarklyAdapter } from '@flags-sdk/launchdarkly';

  const ldAdapter = createLaunchDarklyAdapter({
    projectSlug: process.env.LAUNCHDARKLY_PROJECT_SLUG,
    clientSideId: process.env.LAUNCHDARKLY_CLIENT_SIDE_ID,
    edgeConfigConnectionString: process.env.EDGE_CONFIG,
  });
  ```
