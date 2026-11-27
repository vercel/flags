---
'@flags-sdk/next': minor
---

Add the manifest of the flags. With the route `export { GET } from '@flags-sdk/next/manifest'` in `app/.well-known/flags/manifest.json/route.ts`, `next dev` serves the manifest of all modules with `'use flags'`, and `next build` writes it into `.next/flags-manifest.json`. `withFlags` also accepts a `next` version other than the one of this package in its types.
