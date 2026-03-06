---
"flags": patch
---

We now handle calling `precompute` and `generatePermutations` with an empty flags array, which can happen when an app goes from having multiple flags to having none. In this case we use `__no_flags__` as the serialized value so the app will still rewrite and prerender the page.
