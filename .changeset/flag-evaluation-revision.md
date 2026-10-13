---
"@vercel/flags-core": patch
---

Report the flags config `revision` on `FLAG_EVALUATION` usage events, so evaluations can be broken down by the config revision that was served. Evaluations of different revisions are no longer merged into the same aggregated event.
