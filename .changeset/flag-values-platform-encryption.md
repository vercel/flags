---
'flags': minor
---

`encryptFlagValues` encrypts with the public key of Vercel when there is no `FLAGS_SECRET`, instead of throwing. In SvelteKit, `createHandle` and `encryptFlagValues` work without `FLAGS_SECRET` too: the flag values of a page are encrypted with the public key, the overrides cookie is ignored, and `/.well-known/vercel/flags` responds with 401.
