---
"@vercel/prepare-flags-definitions": patch
---

Record `fetchedAt` when a datafile fetch completes and preserve it in generated flag definitions. Loading the bundle retains the original timestamp so the Flags SDK can determine its age.
