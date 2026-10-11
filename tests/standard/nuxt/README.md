# Nuxt test app of the Flags SDK

Tests the Flags SDK in a real Nuxt app: the module `@flags-sdk/nuxt` (the
registration of `'use flags'` modules in Vite and in Nitro, the manifest of
the flags in development, and `flags-manifest.json` in the server output),
and the evaluation in `runtime.onInvoke` of a server route.

```sh
pnpm test:e2e
```
