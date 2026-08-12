---
'flags': minor
'@flags-sdk/vercel': minor
'@vercel/flags-core': minor
---

Add a system `now` accessor and lock evaluation time per request/batch.

Flag conditions can compare against the current time with BEFORE/AFTER (ISO or epoch ms) or numeric GT/GTE/LT/LTE. Rollouts and bulk evaluation share one locked `now` so results stay consistent within a request.
