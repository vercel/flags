# @flags-sdk/sveltekit

## 0.1.0-standard.0

### Minor Changes

- [#639](https://github.com/vercel/flags/pull/639) [`81b4fdf`](https://github.com/vercel/flags/commit/81b4fdf75c26f8836a24844efe81e3412b296c15) Thanks [@dferber90](https://github.com/dferber90)! - The SvelteKit integration of the Flags SDK v5: `flags()` of `@flags-sdk/sveltekit/vite` connects `flags` to the request of SvelteKit (`getRequestEvent()`). `createHandle` adds the values of the evaluated flags to the page and the endpoint `/.well-known/vercel/flags`, and `createFlagsDiscoveryEndpoint` creates the endpoint as a route.

### Patch Changes

- Updated dependencies [[`81b4fdf`](https://github.com/vercel/flags/commit/81b4fdf75c26f8836a24844efe81e3412b296c15)]:
  - flags@5.0.0-standard.0
