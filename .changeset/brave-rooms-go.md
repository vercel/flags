---
"@vercel/flags-core": patch
"@flags-sdk/vercel": patch
---

Loosen the type restrictions on the `Evaluation` type as the previous implementation would only work with `interface` but not with `type` that lead to an accidental breaking change.
