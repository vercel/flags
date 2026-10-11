# Express test app of the Flags SDK

Tests the Flags SDK in an Express app on Node.js, without a bundler: the
middleware of `@flags-sdk/express` (the request in `runtime.onInvoke`, and
`flags.config.ts`), the overrides, and the script `flags manifest`.

```sh
pnpm test:e2e
```

Node.js 22.18 or newer runs the TypeScript source directly.
