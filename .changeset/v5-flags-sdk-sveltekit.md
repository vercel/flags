---
'@flags-sdk/sveltekit': minor
---

The SvelteKit integration of the Flags SDK v5: `flags()` of `@flags-sdk/sveltekit/vite` connects `flags` to the request of SvelteKit (`getRequestEvent()`). `createHandle` adds the values of the evaluated flags to the page and the endpoint `/.well-known/vercel/flags`, and `createFlagsDiscoveryEndpoint` creates the endpoint as a route.
