---
'@vercel/flags-core': patch
---

Strip the `g` and `y` flags from RegEx conditions to prevent cached `RegExp` instances from retaining `lastIndex` state.
