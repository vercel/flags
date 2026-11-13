---
'flags': minor
---

Precompute works on Vercel without a `FLAGS_SECRET`. When there is no secret, `precompute`, `serialize`, `deserialize`, `getPrecomputed` and `generatePermutations` (Next.js and SvelteKit) sign the code with a key derived from `VERCEL_DEPLOYMENT_KEY`, which Vercel sets for the build and for the runtime of a deployment.

Each deployment has its own key, so a code is only valid inside the deployment which created it. Set `FLAGS_PRECOMPUTE_SECRET` or `FLAGS_SECRET`, or pass a secret, if a code must be valid in another deployment or project.

The new variable `FLAGS_PRECOMPUTE_SECRET` sets a secret for precompute only. The order is: a secret passed to the function, `FLAGS_PRECOMPUTE_SECRET`, `FLAGS_SECRET`, the key of the deployment, the fixed secret of development. In SvelteKit, a secret passed to `createHandle` is still the only one which reads a code: pass the same secret to `precompute` and `generatePermutations`, or none to all of them.

In local development (`NODE_ENV` is `development`, e.g. `next dev` or `vite dev`), these functions use a fixed secret when there is no other one.

Without a secret and without `VERCEL_DEPLOYMENT_KEY` outside of development (e.g. a local `next build && next start`, a self-hosted app, or a build with `vercel build` which is deployed with `vercel deploy --prebuilt`), these functions throw as before.
