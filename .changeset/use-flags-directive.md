---
'flags': minor
---

Add the `'use flags'` directive: each export of a module which starts with `'use flags'` is a flag. The new `flags/manifest` creates the manifest of the flags from these modules (`createManifest`, `validateFlagsManifest`), and `flags/tooling` has the functions for build plugins (`hasUseFlagsDirective`, `findFlagsModules`, `writeManifestFromBuild`).
