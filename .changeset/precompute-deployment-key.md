---
'flags': minor
---

Precompute works on Vercel without a `FLAGS_SECRET`. When there is no secret, `precompute`, `serialize`, `deserialize`, `getPrecomputed` and `generatePermutations` (Next.js and SvelteKit) sign the code with a key derived from `VERCEL_DEPLOYMENT_KEY`, which Vercel sets for the build and for the runtime of a deployment.

Each deployment has its own key, so a code is only valid inside the deployment which created it. Set `FLAGS_SECRET` or `FLAGS_PRECOMPUTE_SECRET`, or pass a secret, if a code must be valid in another deployment or project.

The new variable `FLAGS_PRECOMPUTE_SECRET` sets a secret for precompute only. It is only used when there is no `FLAGS_SECRET`. The order is: a secret passed to the function, `FLAGS_SECRET`, `FLAGS_PRECOMPUTE_SECRET`, the key of the deployment, the public secret outside of Vercel. In SvelteKit, pass the same secret to `createHandle`, `precompute` and `generatePermutations`, or none to all of them.

In the local development of a Vercel project (e.g. `next dev` or a local `next build && next start` after `vercel env pull`, which writes a `VERCEL_OIDC_TOKEN` for the environment `development`), these functions use a fixed, public secret when there is no other one. Anyone can create a code with it, so they warn one time when `NODE_ENV` is not `development`. Without such a token, e.g. on a custom host, they throw without a secret, as before.

In a Turborepo task, a cache hit replays codes of another deployment, because `VERCEL_DEPLOYMENT_KEY` is not part of the hash of the task. Add `VERCEL_DEPLOYMENT_KEY` to the `env` of the task in `turbo.json`, or set `FLAGS_PRECOMPUTE_SECRET`.

On Vercel without a secret and without `VERCEL_DEPLOYMENT_KEY` (a project which does not expose the system environment variables, or a build with `vercel build` which is deployed with `vercel deploy --prebuilt`), these functions throw as before.
