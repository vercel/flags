---
'flags': minor
---

`encryptFlagValues` encrypts with the public key of Vercel when there is no `FLAGS_SECRET`, instead of throwing. In SvelteKit, `createHandle` and `encryptFlagValues` work without `FLAGS_SECRET` too: the flag values of a page are encrypted with the public key.

This fallback is silent. Before, a secret which is `undefined` or empty (e.g. `encryptFlagValues(values, process.env.TYPO)`) threw an error. Now the values are encrypted with the public key, and `decryptFlagValues` can not read them, because only Vercel can decrypt them: it logs a warning and returns `undefined`.

`decryptFlagValues`, `encryptFlagDefinitions` and `decryptFlagDefinitions` keep working only with a `FLAGS_SECRET`.

The project of the host is also read from the OIDC token of the request (`x-vercel-oidc-token`), so a deployment which does not expose the system environment variables works too.
