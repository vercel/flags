# Hono test app of the Flags SDK

Tests the Flags SDK in a Hono app on Node.js, without a bundler: the
evaluation in `runtime.onInvoke` of a middleware, and the script
`flags manifest`, which writes the manifest of the flags from the modules
with `'use flags'`.

```sh
pnpm test:e2e
```

Node.js 22.18 or newer runs the TypeScript source directly.
