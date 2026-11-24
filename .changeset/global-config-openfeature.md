---
'@flags-sdk/global-config': major
---

`@flags-sdk/global-config` is an OpenFeature provider for the Flags SDK v5: `GlobalConfigProvider` of `@flags-sdk/global-config/openfeature` (also the main export). It reads the flags from one item of a Global Config store, by default `flags`, and connects with `GLOBAL_CONFIG` (or `EDGE_CONFIG`) on the first evaluation. It needs no `@openfeature/server-sdk` at runtime.

The v4 adapter (`globalConfigAdapter`, `createGlobalConfigAdapter`, `resetDefaultGlobalConfigAdapter`) is removed. The option `globalConfigItemKey` is now `itemKey`.
