---
'@flags-sdk/next': patch
---

Finds a cache scope also with the error messages of Next.js 16.4.6, e.g. ``headers()` can't be read inside `"use cache"` ``. Before, a flag in `'use cache'` was evaluated without the request, and its value could be cached.
