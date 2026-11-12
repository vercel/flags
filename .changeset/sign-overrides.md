---
"flags": minor
---

Add `signOverrides`, which signs flag overrides with Vercel for the project and the environment of the host. A host without a `FLAGS_SECRET` accepts the signed token in the `vercel-flag-overrides` cookie, so e.g. end-to-end tests can override flags without `encryptOverrides`.

It uses the OIDC token of the host: of the request on a deployment, or the `VERCEL_OIDC_TOKEN` of `vercel env pull`.
