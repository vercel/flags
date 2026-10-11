# SvelteKit test app of the Flags SDK

Tests the Flags SDK in a real SvelteKit app: the Vite plugin of
`@flags-sdk/vite` (the registration of `'use flags'` modules, and the manifest
of the flags in development and in the build), and the evaluation in
`runtime.onInvoke` of `hooks.server.ts`.

```sh
pnpm test:e2e
```
