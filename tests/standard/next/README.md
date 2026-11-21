# Next.js test app of the Flags SDK

Tests the Flags SDK and its framework contract in a real Next.js app: the
plugin `withFlags`, the hooks of `flags/hooks.ts`, the request source, the
cache of each request, overrides, `FlagValues`, precompute and the proxy.

```sh
pnpm test:e2e
```

`pnpm test:e2e` builds the app with `next build`, then runs the Playwright
tests against `next start`.
