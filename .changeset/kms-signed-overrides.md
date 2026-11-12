---
"flags": minor
---

Accept flag overrides which the Vercel Toolbar signs with Vercel KMS, so overrides work on Vercel without a `FLAGS_SECRET`.

On Vercel, or locally after `vercel env pull`, the SDK verifies signed override tokens with the public keys of Vercel, which it keeps in memory. `decryptOverrides` accepts them too, for apps which read the cookie themselves. Tokens encrypted with the `FLAGS_SECRET` keep working exactly as before. The cookie is still `vercel-flag-overrides`.

The host must know that it runs for a Vercel project. On Vercel, it reads the project from the [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables) (`VERCEL`, `VERCEL_PROJECT_ID`), or from the OIDC token of the request (`x-vercel-oidc-token`). With that token, a deployment also checks the team of a signed token. Locally, `vercel env pull` supplies the `VERCEL_OIDC_TOKEN`. SvelteKit also reads it from `$env` during `vite dev`.

A signed token which the host can not use is ignored, with a warning which names the cause: the host can not verify signed tokens, the public keys do not load, or the token is for a different project or environment.

Without a `FLAGS_SECRET`, a Next.js flag now ignores an overrides cookie which the host can not read (e.g. an encrypted cookie from before the secret was removed). Before, it threw `flags: Missing FLAGS_SECRET`.

Add `signOverrides`, which asks Vercel to sign flag overrides for the project and the environment of the host, e.g. for end-to-end tests of a project without a `FLAGS_SECRET`. It uses the OIDC token of the host: of the request on a deployment, or the `VERCEL_OIDC_TOKEN` of `vercel env pull`. Pass a `token`, a `projectId`, an `environment` and a `teamId` to sign for another project or environment, e.g. with a Vercel access token.
