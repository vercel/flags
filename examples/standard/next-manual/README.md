# Demo: Next.js without code generation

The Flags SDK with Next.js. The source and the flags are written by hand in
`flags.ts`, so this demo needs no code generation. It shows:

- `withFlags` of `@flags-sdk/next/plugin` in `next.config.ts`
- a `'use flags'` module with a source (`defineSource`), flags of the
  source (`bindFlag`), and an inline flag (`defineFlag` with `decide`)
- a value of the provider which is not one of the options
- overrides of Flags Explorer with `FLAGS_SECRET`
- the Flags Discovery Endpoint in `app/.well-known/vercel/flags/route.ts`,
  which the application adds by hand

```sh
pnpm --filter flags --filter @flags-sdk/next build
FLAGS_SECRET=... pnpm dev   # http://localhost:4410, try the cookies user=alice and beta=1
pnpm test                   # builds, then tests the build with next start
```
