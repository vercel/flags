---
'flags': patch
---

Serialization of a flag with 252 or more options is now correct. Before this fix, option indices 252 to 255 were read back as `null`, `false`, `true`, or an unlisted value, and indices of 256 or more were truncated. These options now use the unlisted-value path, so their values are kept.
