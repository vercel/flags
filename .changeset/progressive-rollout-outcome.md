---
"@vercel/flags-core": minor
---

Add support for `progressive-rollout` outcomes in the core evaluator.

This introduces a new packed outcome type that ramps a single target variant against a default variant using deterministic bucketing by a configurable entity base and an absolute time-window schedule.
