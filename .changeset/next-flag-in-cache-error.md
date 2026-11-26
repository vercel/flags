---
'flags': patch
---

`flags/next`: a flag inside a cache scope, e.g. `"use cache"` or `unstable_cache()`, now fails with a clear error: "A flag can not be evaluated inside a cache scope … Evaluate the flag outside of the cached function, and pass the value in as an argument." The error of Next.js is its `cause`. Before, it failed with the error of `headers()`. The SDK also uses `unstable_rethrow` of Next.js to recognize the internal errors of Next.js, e.g. of `redirect()`, which it must throw again. The peer dependency on `next` is now `>=15.0.0`, the first version with `unstable_rethrow`. Next.js 14 is out of support.
