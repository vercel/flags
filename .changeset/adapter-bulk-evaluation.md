---
'@flags-sdk/vercel': minor
---

Faster evaluation of flags when using the Vercel adapter via `bulk()`.

This version of `flags-sdk/vercel` implements `bulkDecide` on the Vercel Flags adapter so flags can be evaluated together via `bulk()` from `flags/next`.

This improves performance by avoiding the per-flag overhead of separate `evaluate()` calls. We've seen a 10x improvement in evaluation time for large batches of flags.
