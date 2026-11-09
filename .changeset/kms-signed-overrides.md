---
"flags": minor
---

Accept flag overrides which the Vercel Toolbar signs with Vercel KMS, so overrides work on Vercel without a `FLAGS_SECRET`.

On Vercel, or locally after `vercel env pull`, the SDK verifies signed override tokens with the public keys of Vercel, which it keeps in memory. `decryptOverrides` accepts them too, for apps which read the cookie themselves. Tokens encrypted with the `FLAGS_SECRET` keep working exactly as before. The cookie is still `vercel-flag-overrides`.
