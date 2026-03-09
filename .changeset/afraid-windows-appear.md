---
"flags": patch
---

The Flags SDK now handles when an app goes from precomputing one or more flags to precomputing none.

In this case we use `__no_flags__` as the serialized value so the app will still rewrite and prerender the page.

`precompute`, `generatePermutations`, `serialize` and `deserialize` were adjusted to generate and parse `__no_flags__` correctly.
