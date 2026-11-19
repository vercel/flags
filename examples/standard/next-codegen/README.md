# Demo: Next.js with code generation

The Flags SDK with Next.js and code generation. Each source is a directory
in `flags/sources`, and the pages import its flags by name:

```ts
import { checkout, 'summer-sale' as summerSale } from 'flags:shop';
```

- `flags/sources/<source>/catalog.ts`: the flags, for the code generation
  only. It runs at build time and in development.
- `flags/sources/<source>/provider.ts`: the OpenFeature provider.
- `flags/sources/<source>/context.ts`: `getEvaluationContext(input, request)`.

`withFlags({}, { codeGeneration: true })` in `next.config.ts` writes
`.flags/<source>.ts` (one `defineSource` and one `bindFlag` for each flag) and
points `flags:<source>` to it. `tsconfig.json` has
`"paths": { "flags:*": ["./.flags/*"] }` for the types. The manifest
of the flags for Flags Explorer is the route
`app/.well-known/flags/manifest.json/route.ts` in development, and
`.next/flags-manifest.json` after `next build`.

```sh
pnpm --filter flags --filter @flags-sdk/next build
FLAGS_SECRET=... pnpm dev   # http://localhost:4420, try the cookies user=alice and visited=1
pnpm test                   # builds, then tests the build with next start
```
