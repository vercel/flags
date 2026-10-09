# @vercel/flags-core

## 1.10.0

### Minor Changes

- [#511](https://github.com/vercel/flags/pull/511) [`3f925dc`](https://github.com/vercel/flags/commit/3f925dceacd7b66a90d932dfda0cb45c861c008a) Thanks [@luismeyer](https://github.com/luismeyer)! - Add a header-driven `vercel` client mode, enabled by default when `VERCEL=1`. Initialization loads provided/bundled definitions. At module scope it starts no network activity, and an empty cache fetches on its first read. Inside a request, `initialize()` prepares the cache like the first evaluation would (confirm a matching version, fetch a newer one or an empty cache, or start streaming/polling for a missing entry), and repeated calls in later requests repeat that preparation. Request versions trigger refreshes. Explicit offline/build behavior is preserved.
  
  Evaluations require a valid positive version header for their own project. Missing, empty, malformed, or unrelated project entries permanently start streaming when enabled, otherwise polling; multiple clients select their sources independently. Concurrent reads share startup and pending HTTP refreshes. Accepted stream updates and valid confirmations cancel superseded refreshes; waiting reads use the confirmed cache, and late responses cannot change cache or authorization state. A cold shared fetch discovers project identity before accepting header evidence; a failed cold fetch rejects without switching sources and is retried by the next read. `getDatafile()` remains a snapshot that never starts streaming or polling: it serves cached definitions through the same header checks, stale-while-revalidate, blocking refresh, and stale-if-error, and loads bundled definitions or performs a one-time fetch when the cache is empty.
  
  **Cached definitions now age in streaming and polling mode.** Streaming data is fresh for 60 seconds after the last message; polling data is fresh for its interval plus the 10-second fetch deadline (40 seconds by default). Polling data then stays stale for `staleWhileRevalidate` seconds (default 10) while reads refresh over HTTP in the background, and expired reads wait for the shared fetch. While streaming, reads never wait and no HTTP request competes with the connection: older data is served immediately and reported as stale while the stream's ping watchdog reconnects in the background, including right after a suspended runtime resumes. Data without a known age is served until its source first confirms it. Accepted updates, source responses, valid confirmations, and stream pings reset age without rewriting `fetchedAt`.
  
  Streaming and polling never run at the same time. A stream startup timeout or disconnect keeps the stream reconnecting in the background while reads serve the cache; polling starts only once the stream gives up for good (retries exhausted, 401, or token failure), waiting for its first poll up to `polling.initTimeoutMs`. Ping timeouts reconnect the stream internally, allowing suspended runtimes to resume. Polling gives up on a 401 too. Whenever no live source is active, because the stream is reconnecting or the stream or polling gave up, reads apply plain stale-while-revalidate over HTTP: fresh within `staleWhileRevalidate`, served while refreshing in the background beyond that, and waiting for the refresh once older than `staleWhileRevalidate` plus `staleIfError`; data of unknown age refreshes in the background. Shutting down and reinitializing a client rewires its sources and starts with a clean cache and failure deadline.
  
  Use `staleWhileRevalidate` (default 10) and `staleIfError` (default Infinity) in **seconds**, including fractions. Setting either to `0` disables its stale allowance. Datafiles preserve optional `fetchedAt` epoch-millisecond timestamps across serialization and bundled/provided reuse.

- [#540](https://github.com/vercel/flags/pull/540) [`1a38dee`](https://github.com/vercel/flags/commit/1a38dee43b41030496bd63290816e06e5d5890ae) Thanks [@vincent-derks](https://github.com/vincent-derks)! - Remove the internal `projectId` connection string option introduced in 1.9.0. SDK keys and `sdkKey=` connection strings are unchanged.

- [#510](https://github.com/vercel/flags/pull/510) [`571141d`](https://github.com/vercel/flags/commit/571141da0e2a224e24e45c088c249a382fbde9b5) Thanks [@luismeyer](https://github.com/luismeyer)! - Add `staleIfError` in seconds to bound cached runtime reads after the first consecutive stream/poll failure or stream disconnect. The default `Infinity` preserves unlimited fallback; finite nonnegative durations (including fractional seconds) use existing evaluation defaults and errors after expiry, and `getDatafile()` follows the same allowance. Any successful source response resets the allowance, including one the version guard rejects as older or for a different project, as does a matching stream primed revision. Storing provided or bundled fallback data does not confirm freshness or renew the failure clock. Build/offline behavior and source scheduling remain unchanged.

### Patch Changes

- [#518](https://github.com/vercel/flags/pull/518) [`941e71d`](https://github.com/vercel/flags/commit/941e71df674db21a28262cfe30f2048d7a64b3b1) Thanks [@luismeyer](https://github.com/luismeyer)! - Add detailed client lifecycle, cache freshness, and network diagnostics using the `DEBUG=@vercel/flags-core` environment variable. `DEBUG` now follows the usual conventions for both the diagnostics and the ingest debug header: comma- or space-separated patterns, `*` wildcards, and `-` exclusions. A shared global logger emits events without passing logger instances through the client. Every client diagnostic includes the configured `clientName`, including cache, source, and background network activity. Logs omit credentials, definitions, and raw errors.
  
  State changes include their cause; refresh logs distinguish response receipt, cache application, shared work, stream confirmation, and shutdown cancellation. Startup and source logs expose timeout and freshness thresholds, and recovery is logged only when a failure clears.

- [#511](https://github.com/vercel/flags/pull/511) [`3f925dc`](https://github.com/vercel/flags/commit/3f925dceacd7b66a90d932dfda0cb45c861c008a) Thanks [@luismeyer](https://github.com/luismeyer)! - Record `fetchedAt` when a datafile fetch completes and preserve it in generated flag definitions. Loading the bundle retains the original timestamp so the Flags SDK can determine its age.
  
  Expose optional `fetchedAt` metadata on datafiles. Record it for accepted live updates and preserve valid timestamps when loading provided or bundled definitions, without mutating the input.

## 1.9.0

### Minor Changes

- [#517](https://github.com/vercel/flags/pull/517) [`d03e4f6`](https://github.com/vercel/flags/commit/d03e4f63ed645339c6a3a312f26ee77eb4cf03ef) Thanks [@vincent-derks](https://github.com/vincent-derks)! - Accept `flags:projectId=<id>` connection strings.

- [#537](https://github.com/vercel/flags/pull/537) [`c49aab6`](https://github.com/vercel/flags/commit/c49aab65a8d5f4327552c18179b3f8d761b0f53e) Thanks [@dferber90](https://github.com/dferber90)! - Allow progressive rollouts to end at a configurable percentage using `finalPromille` (for example, `50_000` for 50%). Rollouts without this field continue to end at 100%.

### Patch Changes

- [#396](https://github.com/vercel/flags/pull/396) [`c3026fe`](https://github.com/vercel/flags/commit/c3026fe78b527f8c4300f444751ef4f9325db50e) Thanks [@Nexory](https://github.com/Nexory)! - fix(typed-emitter): clean up empty Set from Map on last off() call

## 1.8.3

### Patch Changes

- [#507](https://github.com/vercel/flags/pull/507) [`c43b9d9`](https://github.com/vercel/flags/commit/c43b9d9076009a6a70ca2de55020ebcb15b1a4cc) Thanks [@luismeyer](https://github.com/luismeyer)! - Retry transient datafile fetch failures across polling, build loading, and offline fallback reads. Fetches use up to three attempts within a shared ten-second deadline that includes authentication, backoff, and body parsing. Shutdown also cancels retries during polling initialization.

- [#533](https://github.com/vercel/flags/pull/533) [`7027cb2`](https://github.com/vercel/flags/commit/7027cb271183566ee224c6a96d36cb12ce7cf2fa) Thanks [@dferber90](https://github.com/dferber90)! - Strip all occurrences of the `g` and `y` flags from regex conditions so cached regular expressions produce consistent results across users and repeated evaluations, including when both flags are present.

## 1.8.2

### Patch Changes

- [#497](https://github.com/vercel/flags/pull/497) [`4848877`](https://github.com/vercel/flags/commit/4848877ca60c8595745b7759e351e936d7fe5889) Thanks [@feugy](https://github.com/feugy)! - Allow passing a custom `waitUntil` function to `createClient` for background
  usage and exposure reporting. Pending exposure reports are drained by
  `client.shutdown()`. The Next.js conditional export uses `after` from
  `next/server` by default.

- [#490](https://github.com/vercel/flags/pull/490) [`186ea50`](https://github.com/vercel/flags/commit/186ea5092b22cd3eadf136824ecb2d7293a047fd) Thanks [@AndyBitz](https://github.com/AndyBitz)! - Use the runtime-provided ingest transport when available

## 1.8.1

### Patch Changes

- [#486](https://github.com/vercel/flags/pull/486) [`c9d2811`](https://github.com/vercel/flags/commit/c9d28116ebca661f4e3c73f301d4b2d35310c823) Thanks [@dferber90](https://github.com/dferber90)! - Add APIs for reporting flag exposures and override values.
  
  - The `experimental_reportExposures` client option for supplying an exposure
    reporter.
  - The `experimental_reportOverride` client method for reporting values set by
    the Flags SDK override cookie.
  - The `experimental_exposureLogging` option on `evaluate()` and
    `bulkEvaluate()` for disabling exposure reporting for an individual call.
  - Experiment assignment metadata on `EvaluationResult.experiment`.
  - The `experimental_EvaluationOptions`,
    `experimental_ExperimentAssignment`, `experimental_Exposure`, and
    `experimental_ReportExposures` types.
  
  These APIs are not supported for general use yet. Do not use them unless
  Vercel has explicitly enabled them for you.

- [#494](https://github.com/vercel/flags/pull/494) [`e0eebe6`](https://github.com/vercel/flags/commit/e0eebe6fbc296636761eb3dc31f2c4be01a398bf) Thanks [@luismeyer](https://github.com/luismeyer)! - Request an uncompressed `/v1/stream` body when running on Bun.
  
  Bun's `fetch` negotiates brotli or gzip by default, but its streaming decoder withholds small decoded output until more compressed input arrives. The stream's first datafile is followed by silence until the next ping, so on Bun the initial datafile never surfaced, init timed out, and every flag fell back to its default. Sending `Accept-Encoding: identity` on Bun avoids the decoder entirely; other runtimes are unchanged.

## 1.8.0

### Minor Changes

- [#453](https://github.com/vercel/flags/pull/453) [`cc8c266`](https://github.com/vercel/flags/commit/cc8c26648cb499a2c191c58a5354d5da5d359dcd) Thanks [@luismeyer](https://github.com/luismeyer)! - Add a `metricEnvironment` client option for associating evaluation metrics with an environment when sending them to the ingestion endpoint.

## 1.7.1

### Patch Changes

- [#450](https://github.com/vercel/flags/pull/450) [`ceb1519`](https://github.com/vercel/flags/commit/ceb15198f73a973ac559648b8d978c23d23ef0c5) Thanks [@dferber90](https://github.com/dferber90)! - Strip the `g` and `y` flags from RegEx conditions to prevent cached `RegExp` instances from retaining `lastIndex` state.

## 1.7.0

### Minor Changes

- [#427](https://github.com/vercel/flags/pull/427) [`50b1aa4`](https://github.com/vercel/flags/commit/50b1aa4f9614b8e78f76cc9e3ae539e58a46fa7e) Thanks [@dferber90](https://github.com/dferber90)! - Align rollout, split, and segment split user assignment onto a single hash bucketing scheme.

  Previously splits and rollouts bucketed users with opposite conventions, so switching a flag between a split and a rollout (or locking in a rollout as a split) could reassign users even when the effective distribution was unchanged. All three now derive their cut points from one shared boundary function over the full hash space, so a rollout at a given percentage is identical to the equivalent split.

  Split assignments are effectively unchanged. Rollouts and segment splits are re-bucketed once with this release; after that, converting a flag between outcome types never reassigns anyone.

## 1.6.0

### Minor Changes

- [#401](https://github.com/vercel/flags/pull/401) [`9dff590`](https://github.com/vercel/flags/commit/9dff590bd5628bd93098637c2e9b3d1a043e4d4b) Thanks [@luismeyer](https://github.com/luismeyer)! - Add aggregated flag evaluation telemetry and a `clientName` option for the Vercel Flags client.

## 1.5.2

### Patch Changes

- [#416](https://github.com/vercel/flags/pull/416) [`f60c99d`](https://github.com/vercel/flags/commit/f60c99d70741e5e8e5af0a069deaf34a3129a27e) Thanks [@dferber90](https://github.com/dferber90)! - Fix datafile serialization across the RSC server/client boundary.

  Evaluation memoized scaled split weights and compiled regexes by attaching
  symbol-keyed properties directly onto objects inside the datafile. While
  symbols are invisible to `JSON.stringify`, React Server Components serialization
  walks objects directly and chokes on these (notably the non-serializable
  `RegExp`), so datafiles could no longer be passed from server to client
  components. Memoization now uses module-level `WeakMap`s keyed by the
  outcome/rhs objects, leaving datafile objects pristine while keeping identical
  caching semantics and lifetime.

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
