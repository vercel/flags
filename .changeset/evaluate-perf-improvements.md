---
'@vercel/flags-core': patch
---

Speed up flag evaluation on the hot path.

- `handleOutcome` no longer recomputes `scaledWeights` on every split-outcome evaluation; the per-outcome scaled weights are cached on first call.
- `matchConditions` no longer recompiles `RegExp` on every REGEX / NOT_REGEX condition; the compiled regex is cached on first call.
- `Controller.read()` and `getDatafile()` no longer re-destructure and re-spread the in-memory datafile on every call; the result is cached and rebuilt only when stream/poll replaces the underlying data.

In micro-benchmarks the pure `evaluate()` path is ~22% faster for split outcomes and ~32% faster for regex conditions. The full `client.evaluate()` path is 14–22% faster across all scenarios.
