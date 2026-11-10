---
'flags': patch
---

`deserialize` and `getPrecomputed` now throw when a precompute code does not match the requested flags group, such as an empty-group code paired with a non-empty group (or the other way around). The `__no_flags__` sentinel is now only accepted when deserializing an empty flags array.
