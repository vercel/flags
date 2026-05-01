---
"@flags-sdk/statsig": major
---

Migrate to `@statsig/statsig-node-core` (Statsig's Rust-based server SDK).

This is a breaking change. The underlying Statsig SDK is now instance-based instead of a singleton, and several method names and option keys have changed.

**Breaking changes**

- The exported `Statsig` is now a class (`new Statsig(key, options)`), not a singleton. Methods such as `Statsig.getFeatureGateSync` no longer exist — use the instance returned by `statsigAdapter.initialize()` and call `getFeatureGate(user, key)` etc.
- Sync method variants (`*Sync`) and `*WithExposureLoggingDisabledSync` are removed. Pass `{ disableExposureLogging: true }` as the third argument instead.
- The `DynamicConfig` and `Experiment` types are now distinct (the adapter's `experiment` getter receives an `Experiment`).
- `statsigOptions` keys changed: use `specsSyncIntervalMs` (was `rulesetsSyncIntervalMs`), `enableIdLists` (was `disableIdListsSync`/`initStrategyForIDLists`), and `dataStore` (was `dataAdapter`).
- `getClientInitializeResponse` now returns a JSON `string` and accepts `{ hashAlgorithm: 'djb2' }` instead of `{ hash: 'djb2' }`.
- The Edge Runtime workaround hooks were removed. The new SDK uses native Node bindings (NAPI) and runs on Node.js only — including Vercel's Fluid Compute. It is not compatible with the Edge Runtime.

**Internal changes**

- Drops the `statsig-node-vercel` dependency. The Edge Config integration is now implemented inline using a custom `DataStore` that reads from `@vercel/edge-config`.
