# @flags-sdk/growthbook

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
