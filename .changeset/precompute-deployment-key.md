---
'flags': minor
---

Precompute works on Vercel without a `FLAGS_SECRET`. When there is no secret, `precompute`, `serialize`, `deserialize`, `getPrecomputed` and `generatePermutations` (Next.js and SvelteKit) sign the code with a key derived from `VERCEL_DEPLOYMENT_KEY`, which Vercel sets for the build and for the runtime of a deployment.

Each deployment has its own key, so a code is only valid inside the deployment which created it. Set `FLAGS_SECRET`, or pass a secret, if a code must be valid in another deployment or project. A `FLAGS_SECRET` and a secret passed to the function are used as before.

Without a secret and without `VERCEL_DEPLOYMENT_KEY` (e.g. local development, a self-hosted app, or a build with `vercel build`), these functions throw as before.
