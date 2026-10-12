# Next.js test app with Cache Components

Tests the Flags SDK in a Next.js app with `cacheComponents` and
`partialPrefetching`:

- A provider can call `Date.now()` without `await connection()` in the
  application, because the binding waits for `connection()`.
- A flag in `'use cache'` throws the error of the SDK, also with a
  `defaultValue`.

```sh
pnpm test:e2e
```

The tests start `next dev` themselves and read its output, because Next.js
logs the errors of the prerender in development.
