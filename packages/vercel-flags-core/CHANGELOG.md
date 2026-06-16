# @vercel/flags-core

## 1.5.1

### Patch Changes

- [#395](https://github.com/vercel/flags/pull/395) [`b0150af`](https://github.com/vercel/flags/commit/b0150af9c8190f0db0efc25409fab89769cab6a7) Thanks [@lucleray](https://github.com/lucleray)! - Reduce log noise from stream reconnects.

  Retryable stream errors are no longer logged on every failed attempt; the
  underlying error is now surfaced only once retries are exhausted (via the
  existing "Max retry count exceeded" log). The stream/polling initialization
  timeout warnings were also reworded to make clear the client keeps connecting
  in the background while serving fallback values.

## 1.5.0

### Minor Changes

- [#385](https://github.com/vercel/flags/pull/385) [`201f9d5`](https://github.com/vercel/flags/commit/201f9d5988d7fc307511e35638e66769d38cedb3) Thanks [@dferber90](https://github.com/dferber90)! - Add `bulkEvaluate` method to `FlagsClient` for resolving multiple flags against shared entities in a single call.

  ```ts
  const results = await client.bulkEvaluate(
    [
      { key: "a", defaultValue: false },
      { key: "b", defaultValue: "off" },
    ],
    entities
  );

  results.a; // EvaluationResult<boolean>
  results.b; // EvaluationResult<string>
  ```

  Avoids the per-flag overhead of separate `evaluate()` calls — the datafile is read once, entities are resolved once, and all flags share the same environment/segments lookup. Each entry in the returned record is a full `EvaluationResult` with `value`, `reason`, `outcomeType`, and `metrics`.

- [#371](https://github.com/vercel/flags/pull/371) [`bd4d01a`](https://github.com/vercel/flags/commit/bd4d01a9b2b5d70bf7ae62cda645d8cd7292ad83) Thanks [@vincent-derks](https://github.com/vincent-derks)! - Add jitter to ingest retries and the batch-flush window.

  The usage tracker now uses AWS-style "Full Jitter" exponential backoff between
  retry attempts (replacing the previous deterministic 100/200ms schedule) and
  randomizes the 5s batch-flush window by ±20% to desynchronize concurrent
  processes. When all retry attempts are exhausted the SDK now logs a structured
  warning so consumers can alert on dropped batches.

- [#390](https://github.com/vercel/flags/pull/390) [`7b5ea9a`](https://github.com/vercel/flags/commit/7b5ea9a808dfd4155bd2bbf321c3b44ec730cda6) Thanks [@luismeyer](https://github.com/luismeyer)! - Add OIDC authentication support for Vercel Flags clients and generated flag definitions.

  `@vercel/flags-core` can now create clients without an SDK key and authenticate with a Vercel OIDC token, while still supporting SDK keys and connection strings. Bundled definitions can be looked up by SDK key hash or OIDC project ID.

  `@vercel/prepare-flags-definitions` now collects both SDK keys and `VERCEL_OIDC_TOKEN`, fetches definitions for each auth entry, deduplicates identical definitions across SDK keys and OIDC project IDs, and writes generated maps keyed by SDK key hash or project ID.

  `@flags-sdk/vercel` now supports provider data lookup for Vercel flag origins that do not include an SDK key, allowing OIDC-backed clients to resolve project metadata.

### Patch Changes

- [#382](https://github.com/vercel/flags/pull/382) [`4d90e91`](https://github.com/vercel/flags/commit/4d90e912a4d7c9d4ef986d5e8dc609c30b203242) Thanks [@dferber90](https://github.com/dferber90)! - Speed up flag evaluation on the hot path.

  - `handleOutcome` no longer recomputes `scaledWeights` on every split-outcome evaluation; the per-outcome scaled weights are cached on first call.
  - `matchConditions` no longer recompiles `RegExp` on every REGEX / NOT_REGEX condition; the compiled regex is cached on first call.
  - `Controller.read()` and `getDatafile()` no longer re-destructure and re-spread the in-memory datafile on every call; the result is cached and rebuilt only when stream/poll replaces the underlying data.

  In micro-benchmarks the pure `evaluate()` path is ~22% faster for split outcomes and ~32% faster for regex conditions. The full `client.evaluate()` path is 14–22% faster across all scenarios.

## 1.4.0

### Minor Changes

- 80dcdad: Add progressive rollout outcome

## 1.3.1

### Patch Changes

- b755ffe: Fix SDK key detection to avoid false positives with third-party identifiers.

  The SDK key validation now uses a regex to require the format `vf_server_*` or `vf_client_*` instead of accepting any string starting with `vf_`. This prevents false positives with third-party service identifiers that happen to start with `vf_` (e.g., Stripe identity flow IDs like `vf_1PyHgVLpWuMxVFx...`).

## 1.3.0

### Minor Changes

- 4446057: Support JSON flag values in addition to boolean, string, and number

## 1.2.1

### Patch Changes

- b81963d: Loosen the type restrictions on the `Evaluation` type as the previous implementation would only work with `interface` but not with `type` that lead to an accidental breaking change.

## 1.2.0

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

- 4a5f56a: Skip sending config read events for dev and custom backends

## 1.1.1

### Patch Changes

- dd1396e: Guard internal flag hooks when Vercel does not expose the expected runtime helpers during evaluation.

## 1.1.0

### Minor Changes

- 823bf78: Add CJS support
- 722b0d0: - adds CONTAINS & NOT_CONTAINS comparators
  - adds case insensitive versions of all string based comparators
- b70c2ea: This version of the SDK will no longer fall back to polling in case of streaming issues, and rely on the current in-memory version of the datafile instead, or fall back to the embedded datafile if no in-memory version is available.

  - Rename `FlagNetworkDataSource` to `Controller` (old name still exported as alias)
  - Rename `FlagNetworkDataSourceOptions` to `ControllerOptions` (old name still exported as alias)
  - Rename `DataSource` interface to `ControllerInterface`
  - Add optional `revision` field to `DatafileInput`

### Patch Changes

- a924044: Fix bug with inverted NOT_ONE_OF segment comparator

## 1.0.1

### Patch Changes

- 7d7719a: Fixed an issue where concurrent flag evaluations (e.g. `Promise.all([client.evaluate('a'), client.evaluate('b')])`) would each trigger a separate initialization, causing a flood of network requests to the flags service. Also fixed stream disconnect during initialization from starting a duplicate polling cycle.

## 1.0.0

### Major Changes

- c71729b: See http://vercel.com/docs/flags/vercel-flags for more information.

### Patch Changes

- Updated dependencies [795dfd4]
  - flags@4.0.3

## 0.1.8

### Patch Changes

- 620974c: [internal] change label to note

## 0.1.7

### Patch Changes

- 43293a3: depend directly on @vercel/edge-config (removed as peer dep)

## 0.1.6

### Patch Changes

- 5f3757a: drop tsconfig dependency
- Updated dependencies [5f3757a]
  - flags@4.0.2

## 0.1.5

### Patch Changes

- 6a7313a: publish cjs bundles besides esm

## 0.1.4

### Patch Changes

- df76e2c: export evaluate fn

## 0.1.3

### Patch Changes

- 9ecc4de: export Packed type

## 0.1.2

### Patch Changes

- bfe9080: export DataSource type

## 0.1.1

### Patch Changes

- ff052f0: upgrade internal @vercel/edge-config dependency to v1.4.3
