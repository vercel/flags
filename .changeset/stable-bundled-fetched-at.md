---
"@vercel/prepare-flags-definitions": patch
---

The bundled definitions now record the time the config last changed as their `fetchedAt`, instead of the time of the build. A config that did not change produces the same bundle in every build, so that a platform can reuse the functions which contain it. The bundle still never looks fresher than it is. When the response has no valid `configUpdatedAt`, or it is in the future, the time of the fetch is used as before.
