# @flags-sdk/global-config

## 0.3.0

### Minor Changes

- [#452](https://github.com/vercel/flags/pull/452) [`58e1f5b`](https://github.com/vercel/flags/commit/58e1f5bcdf0dd3ef44ce689681882792b31851c4) Thanks [@luismeyer](https://github.com/luismeyer)! - Replace `@vercel/edge-config` with `@vercel/global-config`.

  Rename the Edge Config adapter package to `@flags-sdk/global-config` and rename repository-owned Edge Config files, exports, types, options, variables, and environment variables to Global Config.

  The previous Edge Config names remain available as deprecated aliases, and the previous environment variables are still honored as fallbacks, so existing code keeps working without changes.

## 0.2.0

### Minor Changes

- [#403](https://github.com/vercel/flags/pull/403) [`4705ac6`](https://github.com/vercel/flags/commit/4705ac67cbeae0a714445ce14e4ab508c32f0689) Thanks [@dferber90](https://github.com/dferber90)! - Simplify usage and improve evaluation of the Edge Config adapter

  When multiple flags share the same Edge Config adapter, the SDK now evaluates them in a single batched call instead of one by one.

  You can also now pass the adapter by reference instead of calling it:

  ```ts
  import { edgeConfigAdapter } from "@flags-sdk/edge-config";

  // before (still supported)
  flag({ key: "example", adapter: edgeConfigAdapter() });

  // now also works
  flag({ key: "example", adapter: edgeConfigAdapter });
  ```

## 0.1.2

### Patch Changes

- 5f3757a: drop tsconfig dependency

## 0.1.1

### Patch Changes

- ff052f0: upgrade internal @vercel/edge-config dependency to v1.4.3

## 0.1.0

### Minor Changes

- 48cbe45: initial release
