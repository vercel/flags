---
'flags': patch
---

`flags/next`: a flag inside a cache scope, e.g. `"use cache"` or `unstable_cache()`, now fails with a clear error: "A flag can not be evaluated inside a cache scope … Evaluate the flag outside of the cached function, and pass the value in as an argument." The error of Next.js is its `cause`. Before, it failed with the error of `headers()`. Where the version of Next.js has `unstable_rethrow`, the SDK also uses it to recognize the internal errors of Next.js, e.g. of `redirect()`, which it must throw again.
