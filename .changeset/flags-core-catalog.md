---
'@vercel/flags-core': minor
---

Add `@vercel/flags-core/catalog`, a catalog loader of Vercel Flags for the code generation of the Flags SDK: `export { default } from '@vercel/flags-core/catalog'` in `flags/sources/<source>/catalog.ts`. It streams the flags of the project with the SDK key of `FLAGS` or the OIDC token, and supports `projectId` for connected projects. It passes on the description of a flag if the datafile has one.
