---
'flags': minor
---

`encryptFlagValues` encrypts with the public key of Vercel when `FLAGS_SECRET` is not set, instead of throwing. Pass `{ method: 'platform' }` to use the public key even with `FLAGS_SECRET`.
