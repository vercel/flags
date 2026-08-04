# @flags-sdk/statsig

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
