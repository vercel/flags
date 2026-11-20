---
'flags': minor
'@flags-sdk/next': patch
'@flags-sdk/vite': patch
'@flags-sdk/sveltekit': patch
'@flags-sdk/tanstack-start': patch
'@flags-sdk/nuxt': patch
'@flags-sdk/express': patch
'@flags-sdk/hono': patch
---

The main export `flags` contains only what an application needs for its flags: `defineSource`, `defineFlag`, `evaluate`, `track`, `FlagEvaluationError`, `DECIDE_REASON`, `OVERRIDE_REASON` and the types. Two new subpaths contain the rest:

- `flags/runtime`: `runtime`, `registerFlags`, `registerSources` and the types `Config`, `Settings`, `SetupFramework`, `GetRequest`, `LoadConfig`, `Runtime`, `OverridesOptions`, `VercelOverridesOptions` and `PlatformProject`. For framework bindings and for applications without a framework plugin, e.g. with Express, Hono or plain Node.js. All copies of the package share one runtime.
- `flags/explorer`: the protocol of Flags Explorer. `encryptFlagValues`, `decryptFlagValues`, `serializeFlagValues`, `encryptOverrides`, `decryptOverrides`, `signOverrides`, `OverridesError` and their types.
