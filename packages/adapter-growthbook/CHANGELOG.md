# @flags-sdk/growthbook

## 1.0.0-standard.0

### Major Changes

- [`be8a194`](https://github.com/vercel/flags/commit/be8a194f5db9957ad3c6acfa848bfa547e493913) Thanks [@dferber90](https://github.com/dferber90)! - The v4 adapter is removed: `growthbookAdapter`, `createGrowthbookAdapter`, `getOrCreateDefaultGrowthbookAdapter`, `resetDefaultGrowthbookAdapter` and the re-exports of `@growthbook/growthbook`, e.g. `GrowthBookClient`. The Flags SDK v5 has no adapters. Flags come from OpenFeature providers, which you give to `defineSource({ provider })`. For GrowthBook, use `@openfeature/growthbook-provider`. See https://flags-sdk.dev/docs/providers/openfeature.
  
  `getProviderData` stays, with the same options, at `@flags-sdk/growthbook` and `@flags-sdk/growthbook/provider`: it loads the flag definitions of GrowthBook for Flags Explorer. It exists only for compatibility with the old endpoint `/.well-known/vercel/flags` of Flags Explorer, until Flags Explorer can load this metadata from providers itself. The package no longer depends on `flags`, `@growthbook/growthbook`, `@vercel/global-config` or `@vercel/functions`. It exports the types of the data, e.g. `ProviderData`.

## 0.3.1

### Patch Changes

- [#464](https://github.com/vercel/flags/pull/464) [`8913cf1`](https://github.com/vercel/flags/commit/8913cf157808eda595c9c0ed5f21e5c70a5f03ca) Thanks [@AndyBitz](https://github.com/AndyBitz)! - Upgrade `@vercel/global-config` from `1.5.0` to `1.5.1`

## 0.3.0

### Minor Changes

- [#452](https://github.com/vercel/flags/pull/452) [`58e1f5b`](https://github.com/vercel/flags/commit/58e1f5bcdf0dd3ef44ce689681882792b31851c4) Thanks [@luismeyer](https://github.com/luismeyer)! - Replace `@vercel/edge-config` with `@vercel/global-config`.

  Rename the Edge Config adapter package to `@flags-sdk/global-config` and rename repository-owned Edge Config files, exports, types, options, variables, and environment variables to Global Config.

  The previous Edge Config names remain available as deprecated aliases, and the previous environment variables are still honored as fallbacks, so existing code keeps working without changes.

## 0.2.0

### Minor Changes

- 0da9c49: Auto-refresh flag definitions with a stale-while-revalidate strategy

## 0.1.3

### Patch Changes

- 5f3757a: drop tsconfig dependency

## 0.1.2

### Patch Changes

- d43589a: support strings in Edge Config

## 0.1.1

### Patch Changes

- ff052f0: upgrade internal @vercel/edge-config dependency to v1.4.3

## 0.1.0

### Minor Changes

- 6239e2d: initialize
