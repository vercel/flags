# @flags-sdk/reflag

## 1.0.3

### Patch Changes

- [#543](https://github.com/vercel/flags/pull/543) [`afcfecb`](https://github.com/vercel/flags/commit/afcfecbc74fa52018e060f67a663b5136de4899e) Thanks [@dferber90](https://github.com/dferber90)! - Include a Reflag dashboard link in adapter and discovery metadata. Omit missing provider descriptions so merging discovery data preserves descriptions declared in code.

## 1.0.2

### Patch Changes

- [#452](https://github.com/vercel/flags/pull/452) [`58e1f5b`](https://github.com/vercel/flags/commit/58e1f5bcdf0dd3ef44ce689681882792b31851c4) Thanks [@luismeyer](https://github.com/luismeyer)! - Replace `@vercel/edge-config` with `@vercel/global-config`.

  Rename the Edge Config adapter package to `@flags-sdk/global-config` and rename repository-owned Edge Config files, exports, types, options, variables, and environment variables to Global Config.

  The previous Edge Config names remain available as deprecated aliases, and the previous environment variables are still honored as fallbacks, so existing code keeps working without changes.

## 1.0.1

### Patch Changes

- 5f3757a: drop tsconfig dependency

## 0.1.1

### Patch Changes

- 1d662a7: Update to @bucketco/node-sdk@1.8.3

## 0.1.0

### Minor Changes

- 79b25f6: Introduce Bucket adapter
