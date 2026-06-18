# @flags-sdk/edge-config

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
