# @flags-sdk/flagsmith

## 3.0.0-standard.0

### Major Changes

- [`be8a194`](https://github.com/vercel/flags/commit/be8a194f5db9957ad3c6acfa848bfa547e493913) Thanks [@dferber90](https://github.com/dferber90)! - The v4 adapter is removed: `flagsmithAdapter`, `createFlagsmithAdapter` and the re-exported types of `@flagsmith/nodejs`. The Flags SDK v5 has no adapters. Flags come from OpenFeature providers, which you give to `defineSource({ provider })`. See https://flags-sdk.dev/docs/providers/openfeature.
  
  `getProviderData` stays, with the same options: it loads the flag definitions of Flagsmith for Flags Explorer. It exists only for compatibility with the old endpoint `/.well-known/vercel/flags` of Flags Explorer, until Flags Explorer can load this metadata from providers itself. The package no longer depends on `flags` or `@flagsmith/nodejs`. It exports the types of the data, e.g. `ProviderData`.

## 2.0.0

### Major Changes

- [#519](https://github.com/vercel/flags/pull/519) [`05e8e0e`](https://github.com/vercel/flags/commit/05e8e0eddb9c0e158417d33edc85451e269aca0e) Thanks [@dferber90](https://github.com/dferber90)! - Replaced the Flagsmith JavaScript SDK with `@flagsmith/nodejs`, adding support for local evaluation and batched flag evaluation through `evaluate()`.
  
  **Breaking changes**
  
  - The default adapter reads `FLAGSMITH_ENVIRONMENT_KEY` instead of `FLAGSMITH_ENVIRONMENT_ID`.
  - `createFlagsmithAdapter()` now accepts `FlagsmithConfig` from `@flagsmith/nodejs`. Rename `environmentID` to `environmentKey` and `api` to `apiUrl`.
  - Browser SDK options, including `cacheFlags`, `state`, and `onChange`, are no longer supported. Supply user identity and traits through the flag's `identify` function.
  - Internally replaced the deprecated `flagsmith` package with `@flagsmith/nodejs`.
  
  Remote evaluation remains the default and continues to persist identity traits in Flagsmith. For long-running servers, enable local evaluation with a server-side environment key (starting with `ser.`):
  
  ```ts
  const adapter = createFlagsmithAdapter({
    environmentKey: process.env.FLAGSMITH_ENVIRONMENT_KEY,
    enableLocalEvaluation: true,
  });
  ```
  
  Local evaluation shares an environment document across requests and refreshes it every 60 seconds. Configure `environmentRefreshIntervalSeconds` to change the interval, and call the new `adapter.close()` method on shutdown to stop polling. Remote evaluation does not download or poll an environment document.
  
  `evaluate()` fetches flags once per batch. Flags with different coercion modes are evaluated in separate batches. Individual flag evaluation, value coercion, and per-flag defaults remain supported.
  
  **Known limitation:** With local evaluation, `@flagsmith/nodejs` 9.0.3 may retain previously supplied traits for identities with overrides, even when later evaluations of the same identity omit those traits.

## 1.0.1

### Patch Changes

- 5f3757a: drop tsconfig dependency

## 1.0.0

### Major Changes

- 5fa7258: Add `@flags-sdk/flagsmith` adapter
