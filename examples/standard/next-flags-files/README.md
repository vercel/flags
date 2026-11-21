# Demo: Next.js with flags files

The Flags SDK with Next.js and flags files. The flags of the application
are in `app.flags` and `app/marketing.flags`, and the page imports them:

```ts
import { checkout, summerSale } from '../app.flags';
import { heroText } from './marketing.flags';
```

- `app.flags`: the flags of the source `self` (the default). Each
  `flag <key> { … }` is one flag.
- `app/marketing.flags`: the flags of the source `marketing`, next to the
  page which uses them.
- `flags/sources/<source>/provider.ts`: the OpenFeature provider.
- `flags/sources/<source>/context.ts`: `getEvaluationContext(request, input)`.

`withFlags({})` in `next.config.ts` compiles each flags file into one
`defineSource` and one `source.bindFlag` for each flag. Nothing is
downloaded. For TypeScript, it writes `app.d.flags.ts` next to each flags
file (`allowArbitraryExtensions` is on in `tsconfig.json`, and Git ignores
the files). The manifest of the flags for Flags Explorer is the route
`app/.well-known/flags/manifest.json/route.ts` in development, and
`.next/flags-manifest.json` after `next build`.

```sh
pnpm --filter flags --filter @flags-sdk/next build
FLAGS_SECRET=... pnpm dev   # http://localhost:4430, try the cookies user=alice and visited=1
pnpm test                   # builds, then tests the build with next start
```
