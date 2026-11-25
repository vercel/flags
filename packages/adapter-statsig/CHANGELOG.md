# @flags-sdk/statsig

## 1.0.0-standard.0

### Major Changes

- [`be8a194`](https://github.com/vercel/flags/commit/be8a194f5db9957ad3c6acfa848bfa547e493913) Thanks [@dferber90](https://github.com/dferber90)! - The v4 adapter is removed: `statsigAdapter`, `createStatsigAdapter`, `createDefaultStatsigAdapter`, `resetDefaultStatsigAdapter`, the re-exports of `statsig-node-lite` (`Statsig`, `StatsigUser`, `StatsigOptions`, `DynamicConfig`, `Layer`), the type `FeatureGate`, and the Global Config data adapter of `statsig-node-vercel`. The Flags SDK v5 has no adapters. Flags come from OpenFeature providers, which you give to `defineSource({ provider })`. Use `StatsigProvider` of `@flags-sdk/statsig/openfeature`. See https://flags-sdk.dev/docs/providers/openfeature.
  
  `StatsigProvider` and `getProviderData` stay. `getProviderData` loads the definitions of Statsig for Flags Explorer, with the same options, at `@flags-sdk/statsig` and `@flags-sdk/statsig/provider`. It exists only for compatibility with the old endpoint `/.well-known/vercel/flags` of Flags Explorer, until Flags Explorer can load this metadata from providers itself. The package no longer depends on `flags`, `statsig-node-lite`, `statsig-node-vercel`, `@vercel/global-config` or `@vercel/functions`. It exports the types of the data, e.g. `ProviderData`.

### Minor Changes

- [#615](https://github.com/vercel/flags/pull/615) [`d5e05d9`](https://github.com/vercel/flags/commit/d5e05d9b4fb2c7b3be85b0c740c572ff7722e602) Thanks [@dferber90](https://github.com/dferber90)! - Add `StatsigProvider`, an OpenFeature server provider for Statsig, at `@flags-sdk/statsig/openfeature`. It uses the Statsig Server Core SDK (`@statsig/statsig-node-core`). A plain flag key reads a feature gate. The prefixes `config:`, `experiment:` and `layer:` read a dynamic config, an experiment or a layer, and a `.<param>` suffix reads one parameter. A key which Statsig rejects (401 or 403) is a fatal error, which is not tried again.

## 0.3.1

### Patch Changes

- [#464](https://github.com/vercel/flags/pull/464) [`8913cf1`](https://github.com/vercel/flags/commit/8913cf157808eda595c9c0ed5f21e5c70a5f03ca) Thanks [@AndyBitz](https://github.com/AndyBitz)! - Upgrade `@vercel/global-config` from `1.5.0` to `1.5.1`

## 0.3.0

### Minor Changes

- [#452](https://github.com/vercel/flags/pull/452) [`58e1f5b`](https://github.com/vercel/flags/commit/58e1f5bcdf0dd3ef44ce689681882792b31851c4) Thanks [@luismeyer](https://github.com/luismeyer)! - Replace `@vercel/edge-config` with `@vercel/global-config`.

  Rename the Edge Config adapter package to `@flags-sdk/global-config` and rename repository-owned Edge Config files, exports, types, options, variables, and environment variables to Global Config.

  The previous Edge Config names remain available as deprecated aliases, and the previous environment variables are still honored as fallbacks, so existing code keeps working without changes.

## 0.2.5

### Patch Changes

- 5f3757a: drop tsconfig dependency

## 0.2.4

### Patch Changes

- ff052f0: upgrade internal @vercel/edge-config dependency to v1.4.3

## 0.2.3

### Patch Changes

- 48adbf2: bump statsig-node-lite to v0.5.2

## 0.2.2

### Patch Changes

- 1e3c8df: If using an Edge Config adapter, reduce minimum sync delay for config specs from 5000ms->1000ms

## 0.2.1

### Patch Changes

- 9a687cb: accept consoleApiKey from getProviderData

## 0.2.0

### Minor Changes

- bd7e10a: Initial support for Feature Gates and Dynamic Configs

## 0.1.0

### Minor Changes

- 3c66284: initialize
