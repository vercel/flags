---
'flags': minor
---

Add TanStack Start support via a new `flags/tanstack-start` entrypoint

The Flags SDK now ships a first-class adapter for [TanStack Start](https://tanstack.com/start/latest), following the same patterns as the Next.js and SvelteKit entrypoints.

```ts
// src/flags.ts
import { flag } from 'flags/tanstack-start';

export const exampleFlag = flag<boolean>({
  key: 'example-flag',
  decide: () => true,
});
```

Flags can be evaluated with no arguments inside a route loader, server function,
or server route — the request is resolved automatically through TanStack Start's
`getRequest()`. You may also pass a `Request` explicitly (e.g. `flag(request)`).

The entrypoint exports `flag`, `getProviderData`, `createFlagsDiscoveryEndpoint`,
`precompute`, `generatePermutations`, and the `encrypt*`/`decrypt*` helpers, plus
support for Vercel Toolbar overrides via the `vercel-flag-overrides` cookie.
