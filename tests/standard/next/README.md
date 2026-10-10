# Next.js test app of the Flags SDK

Tests the Flags SDK and its framework contract in a real Next.js app: the
plugin `withFlags`, the loading of `flags.config.ts`, the request source,
overrides, and the alias of `flags/default-provider` by a platform adapter.

```sh
pnpm test:e2e
```

It builds two variants:

- `.next`: the app, with the default connection of `flags.config.ts`.
- `.next-platform`: without a default connection. The test adapter
  (`adapter.mjs`, loaded from `NEXT_ADAPTER_PATH`) points
  `flags/default-provider` to `platform-provider.mjs`.
