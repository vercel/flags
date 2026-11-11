---
'flags': minor
---

`encryptFlagValues` encrypts with the public key of Vercel when there is no `FLAGS_SECRET`, instead of throwing. In SvelteKit, `createHandle` and `encryptFlagValues` work without `FLAGS_SECRET` too: the flag values of a page are encrypted with the public key, the overrides cookie is ignored, and `/.well-known/vercel/flags` responds with 401.

This fallback is silent. Before, a secret which is `undefined` or empty (e.g. `encryptFlagValues(values, process.env.TYPO)`) threw an error. Now the values are encrypted with the public key, and `decryptFlagValues` can not read them, because only Vercel can decrypt them.
