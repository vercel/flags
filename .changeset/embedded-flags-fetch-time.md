---
"@vercel/prepare-flags-definitions": patch
"@vercel/flags-core": patch
---

Record `fetchedAt` when a datafile fetch completes and preserve it in generated flag definitions. Loading the bundle retains the original timestamp so the Flags SDK can determine its age.

Expose optional `fetchedAt` metadata on datafiles. Record it for accepted live updates and preserve valid timestamps when loading provided or bundled definitions, without mutating the input.
