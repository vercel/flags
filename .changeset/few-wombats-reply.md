---
'@vercel/flags': patch
---

Handle `undefined` values

- fix: Fall back to `defaultValue` when a feature flag returns `undefined`
- fix: Throw error when a flag resolves to `undefined` and no `defaultValue` is present

The value `undefined` can not be serialized so feature flags should never resolve to `undefined`. Use `null` instead.

Fix exports

- fix: Export `Identify` and `Decide` types
