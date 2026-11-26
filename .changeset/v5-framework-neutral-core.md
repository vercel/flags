---
'flags': major
---

The Flags SDK is framework-neutral. `flag()`, `evaluate()`, `dedupe()`, `clearDedupeCacheForCurrentRequest()`, `precompute()`, `generatePermutations()` and `getPrecomputed()` come from `flags`. `flags/next` and `flags/sveltekit` are removed.

A framework gives the SDK the current request through its build plugin, which points the alias `flags/framework` to the binding of the framework:

- Next.js: `withFlags` of `@flags-sdk/next/plugin` in `next.config.ts`. Only Turbopack is supported, and Next.js 16 is the minimum.
- SvelteKit: `flags()` of `@flags-sdk/sveltekit/vite` in `vite.config.ts`. The binding reads the request with `getRequestEvent()` of `$app/server`, so SvelteKit 2.20 is the minimum, and `createHandle` is optional.

Without a plugin, pass the request as before, e.g. `flag(request)` in the Pages Router or `precompute(flags, request)`; `precompute()` now takes an optional request.

The rules of `flags/next` apply to all frameworks. For SvelteKit, this changes: a flag returns its `defaultValue` when `decide` throws or returns `undefined`, the cache of a request is per flag and entities, `identify` runs for each evaluation, `reportValue: false` is respected, and `evaluate()` supports `bulkDecide` of adapters.

New for framework packages: the types `FrameworkBinding` and `FrameworkRequest`, and `getEvaluatedFlagValues(request?)`, the values which a request evaluated.
