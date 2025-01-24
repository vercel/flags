---
'@vercel/flags': patch
---

- fix: Fall back to `defaultValue` when a feature flag returns `undefined`
- fix: Throw error when a flag resolves to `undefined` and no `defaultValue` is present
- fix: Export `Identify` and `Decide` types

The value `undefined` can not be serialized so feature flags should never resolve to `undefined`. Use `null` instead.
