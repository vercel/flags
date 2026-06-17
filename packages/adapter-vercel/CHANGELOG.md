# @flags-sdk/vercel

## 1.4.2

### Patch Changes

- [#402](https://github.com/vercel/flags/pull/402) [`2cb0b49`](https://github.com/vercel/flags/commit/2cb0b49698019779859181f7825b0956bf7e629a) Thanks [@dferber90](https://github.com/dferber90)! - Calling `vercelAdapter()` multiple times now returns the same adapter instance instead of creating a new one each time, which improves performance and memory usage.

## 1.4.1

### Patch Changes

- Updated dependencies [[`b0150af`](https://github.com/vercel/flags/commit/b0150af9c8190f0db0efc25409fab89769cab6a7)]:
  - @vercel/flags-core@1.5.1

## 1.4.0

### Minor Changes

- [#385](https://github.com/vercel/flags/pull/385) [`201f9d5`](https://github.com/vercel/flags/commit/201f9d5988d7fc307511e35638e66769d38cedb3) Thanks [@dferber90](https://github.com/dferber90)! - Reduces overhead when evaluating multiple flags via `evaluate()` or `precompute()` by using new bulk evaluation capabilities of `@vercel/flags-core`.

- [#390](https://github.com/vercel/flags/pull/390) [`7b5ea9a`](https://github.com/vercel/flags/commit/7b5ea9a808dfd4155bd2bbf321c3b44ec730cda6) Thanks [@luismeyer](https://github.com/luismeyer)! - Add OIDC authentication support for Vercel Flags clients and generated flag definitions.

  `@vercel/flags-core` can now create clients without an SDK key and authenticate with a Vercel OIDC token, while still supporting SDK keys and connection strings. Bundled definitions can be looked up by SDK key hash or OIDC project ID.

  `@vercel/prepare-flags-definitions` now collects both SDK keys and `VERCEL_OIDC_TOKEN`, fetches definitions for each auth entry, deduplicates identical definitions across SDK keys and OIDC project IDs, and writes generated maps keyed by SDK key hash or project ID.

  `@flags-sdk/vercel` now supports provider data lookup for Vercel flag origins that do not include an SDK key, allowing OIDC-backed clients to resolve project metadata.

### Patch Changes

- Updated dependencies [[`201f9d5`](https://github.com/vercel/flags/commit/201f9d5988d7fc307511e35638e66769d38cedb3), [`4d90e91`](https://github.com/vercel/flags/commit/4d90e912a4d7c9d4ef986d5e8dc609c30b203242), [`bd4d01a`](https://github.com/vercel/flags/commit/bd4d01a9b2b5d70bf7ae62cda645d8cd7292ad83), [`7b5ea9a`](https://github.com/vercel/flags/commit/7b5ea9a808dfd4155bd2bbf321c3b44ec730cda6)]:
  - @vercel/flags-core@1.5.0

## 1.3.0

### Minor Changes

- 80dcdad: Add progressive rollout outcome

### Patch Changes

- Updated dependencies [80dcdad]
  - @vercel/flags-core@1.4.0

## 1.2.1

### Patch Changes

- Updated dependencies [b755ffe]
  - @vercel/flags-core@1.3.1

## 1.2.0

### Minor Changes

- 4446057: Support JSON flag values in addition to boolean, string, and number

### Patch Changes

- Updated dependencies [4446057]
  - @vercel/flags-core@1.3.0

## 1.1.1

### Patch Changes

- b81963d: Loosen the type restrictions on the `Evaluation` type as the previous implementation would only work with `interface` but not with `type` that lead to an accidental breaking change.
- Updated dependencies [b81963d]
  - @vercel/flags-core@1.2.1

## 1.1.0

### Minor Changes

- 64619d7: Allow specifying entities type when creating clients

  You can now create clients while specifying the entities type:

  ```ts
  type Entities = { user: { id: string; name?: string } };
  const client = createClient<Entities>("");
  client.evaluate("flagKey", undefined, { user: { id: "" } }); // uses Entities type for context
  ```

  You can still narrow the entities type when evaluating flags:

  ```ts
  client.evaluate<{ user: { id: string; name: string } }>(
    "flagKey",
    false,
    { user: { id: "", name: "" } } // uses custom entities type
  );
  ```

### Patch Changes

- Updated dependencies [64619d7]
- Updated dependencies [4a5f56a]
  - @vercel/flags-core@1.2.0

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
