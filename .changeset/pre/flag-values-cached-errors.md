---
'@flags-sdk/next': patch
---

With Cache Components, `FlagValues` no longer fails the prerender when the values can not be encrypted. The cached encryption returns the error instead of throwing, because Next.js fails a prerender when a `'use cache'` function throws. `FlagValues` writes no element and warns once, as documented. The error is cached for minutes, not for the lifetime of the token.
