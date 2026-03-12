# @flags-sdk/vercel

## 1.0.3

### Patch Changes

- Updated dependencies [dd1396e]
  - flags@4.0.5
  - @vercel/flags-core@1.1.1

## 1.0.2

### Patch Changes

- 689b157: Move `@vercel/flags-core` from peerDependency to regular dependency. It is no longer necessary to install `@vercel/flags-core` for the common use case.

  If your app does not use `@vercel/flags-core` directly, you can remove it from your dependencies and do not need to make any code changes.

  In case your app imports `@vercel/flags-core` directly, you should pass your instance of the Vercel Flags client to avoid having multiple instances.

  ```ts
  import { createClient } from "@vercel/flags-core";
  import { createVercelAdapter } from "@flags-sdk/vercel";

  const vercelFlagsClient = createClient(process.env.FLAGS);
  const vercelAdapter = createVercelAdapter(vercelFlagsClient);

  export const exampleFlag = flag({
    key: "example-flag",
    adapter: vercelAdapter(),
  });
  ```

- Updated dependencies [823bf78]
- Updated dependencies [a924044]
- Updated dependencies [722b0d0]
- Updated dependencies [b70c2ea]
  - @vercel/flags-core@1.1.0

## 1.0.1

### Patch Changes

- Updated dependencies [7d7719a]
  - @vercel/flags-core@1.0.1

## 1.0.0

### Major Changes

- c71729b: See http://vercel.com/docs/flags/vercel-flags for more information.

### Patch Changes

- Updated dependencies [795dfd4]
- Updated dependencies [c71729b]
  - flags@4.0.3
  - @vercel/flags-core@1.0.0

## 0.1.8

### Patch Changes

- Updated dependencies [620974c]
  - @vercel/flags-core@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies [43293a3]
  - @vercel/flags-core@0.1.7

## 0.1.6

### Patch Changes

- 5f3757a: drop tsconfig dependency
- Updated dependencies [5f3757a]
  - @vercel/flags-core@0.1.6
  - flags@4.0.2

## 0.1.5

### Patch Changes

- 6a7313a: publish cjs bundles besides esm
- Updated dependencies [6a7313a]
  - @vercel/flags-core@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [df76e2c]
  - @vercel/flags-core@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [9ecc4de]
  - @vercel/flags-core@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [bfe9080]
  - @vercel/flags-core@0.1.2

## 0.1.1

### Patch Changes

- ff052f0: upgrade internal @vercel/edge-config dependency to v1.4.3
- Updated dependencies [ff052f0]
  - @vercel/flags-core@0.1.1
