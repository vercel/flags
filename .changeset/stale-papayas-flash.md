---
"@flags-sdk/vercel": patch
---

Calling `vercelAdapter()` multiple times now returns the same adapter instance instead of creating a new one each time, which improves performance and memory usage.
