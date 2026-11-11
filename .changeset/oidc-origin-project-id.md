---
'@vercel/flags-core': patch
---

The client's `origin` now includes the `projectId` of the deployment's own project when it authenticates with OIDC and `VERCEL_PROJECT_ID` is set. Flags discovery endpoints that pass the origin through, such as `getProviderData` from `flags/next`, now report which project a Vercel Flags flag belongs to.
