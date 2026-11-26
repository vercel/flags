---
'@flags-sdk/next': minor
---

The Next.js integration of the Flags SDK v5: `withFlags` of `@flags-sdk/next/plugin` connects `flags` to the request of the App Router (`headers()` and `cookies()`), and `createFlagsDiscoveryEndpoint` comes from `@flags-sdk/next`. A flag inside `"use cache"` fails with a clear error.
