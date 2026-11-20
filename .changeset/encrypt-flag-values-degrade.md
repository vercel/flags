---
'flags': patch
---

Without a `FLAGS_SECRET`, `encryptFlagValues` no longer throws when the public key of Vercel does not load (e.g. the key host is down, or a request times out). It logs a warning, at most one time in 30 seconds, and returns an empty string, so the build or the render does not fail. The flag values are only for the Vercel Toolbar: the page has none until it renders again.

`FlagValues` of `flags/react` renders nothing for an empty string. If you render the `script` tag with `data-flag-values` yourself, leave it out when the value is empty. In SvelteKit, `createHandle` already rendered the page without the flag values; `encryptFlagValues` of `flags/sveltekit` now returns an empty string too.

`encryptFlagValues` still throws when there is neither a secret nor a project ID, when the project ID is too long, and when the secret is not valid. With a secret nothing changes.
