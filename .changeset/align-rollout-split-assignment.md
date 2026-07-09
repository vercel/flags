---
"@vercel/flags-core": minor
---

Align rollout, split, and segment split user assignment onto a single hash bucketing scheme.

Previously splits and rollouts bucketed users with opposite conventions, so switching a flag between a split and a rollout (or locking in a rollout as a split) could reassign users even when the effective distribution was unchanged. All three now derive their cut points from one shared boundary function over the full hash space, so a rollout at a given percentage is identical to the equivalent split.

Split assignments are effectively unchanged. Rollouts and segment splits are re-bucketed once with this release; after that, converting a flag between outcome types never reassigns anyone.
