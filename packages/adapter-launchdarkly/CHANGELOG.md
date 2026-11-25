# @flags-sdk/launchdarkly

## 2.0.0-standard.0

### Major Changes

- [`be8a194`](https://github.com/vercel/flags/commit/be8a194f5db9957ad3c6acfa848bfa547e493913) Thanks [@dferber90](https://github.com/dferber90)! - The v4 adapter is removed: `ldAdapter`, `createLaunchDarklyAdapter` and the re-exported type `LDContext`. The Flags SDK v5 has no adapters. Flags come from OpenFeature providers, which you give to `defineSource({ provider })`. For LaunchDarkly, use its OpenFeature server provider. See https://flags-sdk.dev/docs/providers/openfeature.
  
  `getProviderData` stays, with the same options: it loads the flag definitions of LaunchDarkly for Flags Explorer. It exists only for compatibility with the old endpoint `/.well-known/vercel/flags` of Flags Explorer, until Flags Explorer can load this metadata from providers itself. The package no longer depends on `flags`, `@launchdarkly/vercel-server-sdk` or `@vercel/global-config`. It exports the types of the data, e.g. `ProviderData`.

## 1.1.1

### Patch Changes

- [#464](https://github.com/vercel/flags/pull/464) [`8913cf1`](https://github.com/vercel/flags/commit/8913cf157808eda595c9c0ed5f21e5c70a5f03ca) Thanks [@AndyBitz](https://github.com/AndyBitz)! - Upgrade `@vercel/global-config` from `1.5.0` to `1.5.1`

## 1.1.0

### Minor Changes

- [#452](https://github.com/vercel/flags/pull/452) [`58e1f5b`](https://github.com/vercel/flags/commit/58e1f5bcdf0dd3ef44ce689681882792b31851c4) Thanks [@luismeyer](https://github.com/luismeyer)! - Replace `@vercel/edge-config` with `@vercel/global-config`.

  Rename the Edge Config adapter package to `@flags-sdk/global-config` and rename repository-owned Edge Config files, exports, types, options, variables, and environment variables to Global Config.

  The previous Edge Config names remain available as deprecated aliases, and the previous environment variables are still honored as fallbacks, so existing code keeps working without changes.

## 1.0.0

### Major Changes

- [#418](https://github.com/vercel/flags/pull/418) [`5488865`](https://github.com/vercel/flags/commit/54888657e895d2c5e32f96baf545b9f798045c2c) Thanks [@mbrakken](https://github.com/mbrakken)! - Support the native LaunchDarkly Marketplace integration.

  **Breaking changes:**

  - The default adapter (`ldAdapter`) now reads the Edge Config connection string from the `EXPERIMENTATION_CONFIG` environment variable instead of `EDGE_CONFIG`. This aligns with the native LaunchDarkly Marketplace integration and matches the behavior of other adapters (e.g. Statsig). `EDGE_CONFIG` is no longer read by the default adapter. The error thrown when `EXPERIMENTATION_CONFIG` is not set changed to `LaunchDarkly Adapter: Missing EXPERIMENTATION_CONFIG environment variable`.

    **If you use the legacy LaunchDarkly Vercel integration** (which provides the connection string as `EDGE_CONFIG`), pass the connection string explicitly with `createLaunchDarklyAdapter`:

    ```ts
    import { createLaunchDarklyAdapter } from "@flags-sdk/launchdarkly";

    const ldAdapter = createLaunchDarklyAdapter({
      projectSlug: process.env.LAUNCHDARKLY_PROJECT_SLUG,
      clientSideId: process.env.LAUNCHDARKLY_CLIENT_SIDE_ID,
      edgeConfigConnectionString: process.env.EDGE_CONFIG,
    });
    ```

## 0.3.4

### Patch Changes

- 5f3757a: drop tsconfig dependency

## 0.3.3

### Patch Changes

- ff052f0: upgrade internal @vercel/edge-config dependency to v1.4.3

## 0.3.2

### Patch Changes

- e1def0e: Significantly improve performance by upgrading to `@launchdarkly/vercel-server-sdk` v1.3.34.

  This release avoids JSON.stringify and JSON.parse overhead which earlier versions of `@launchdarkly/vercel-server-sdk` had.

  See

  - https://github.com/launchdarkly/js-core/releases/tag/vercel-server-sdk-v1.3.34
  - https://github.com/launchdarkly/js-core/pull/918

## 0.3.1

### Patch Changes

- 595e9d0: only read edge config once per request

## 0.3.0

### Minor Changes

- 917ef42: change API from ldAdapter() to ldAdapter.variation()

### Patch Changes

- b375e4e: add metadata to package.json
- 917ef42: expose ldClient on default ldAdapter

## 0.2.1

### Patch Changes

- fbc886a: expose ldAdapter.ldClient
- fbc886a: expose as ldAdapter

## 0.2.0

### Minor Changes

- 2fcc446: Add LaunchDarkly adapter

## 0.1.0

### Minor Changes

- 3c66284: initialize
