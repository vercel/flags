# @flags-sdk/next

## 0.1.0-standard.0

### Minor Changes

- [#639](https://github.com/vercel/flags/pull/639) [`81b4fdf`](https://github.com/vercel/flags/commit/81b4fdf75c26f8836a24844efe81e3412b296c15) Thanks [@dferber90](https://github.com/dferber90)! - The Next.js integration of the Flags SDK v5: `withFlags` of `@flags-sdk/next/plugin` connects `flags` to the request of the App Router (`headers()` and `cookies()`), and `createFlagsDiscoveryEndpoint` comes from `@flags-sdk/next`. A flag inside `"use cache"` fails with a clear error.

### Patch Changes

- Updated dependencies [[`81b4fdf`](https://github.com/vercel/flags/commit/81b4fdf75c26f8836a24844efe81e3412b296c15)]:
  - flags@5.0.0-standard.0
