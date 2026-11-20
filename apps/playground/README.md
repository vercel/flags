# Flags playground

A Next.js demo of the Flags SDK (`packages/flags`) with code generation and
real Vercel Flags. The flags of a source are imports:

```ts
import { flag0 } from 'flags:site';

const enabled = await flag0(); // boolean
```

`site` is the directory `flags/sources/site`. Its catalog supplies the flag
keys and variants, its provider (`VercelProvider` of
`@vercel/flags-core/openfeature`) evaluates the flags, and its context
module creates the evaluation context from the request. The flags need no
declarations in the application.

## Run

From the repository root, with Node.js 22.19 or later:

```sh
pnpm install
pnpm --filter flags --filter @flags-sdk/next --filter @vercel/flags-core build
cd apps/playground
vercel link
vercel env pull .env.local
pnpm dev
```

Skip `vercel link` if this app is already linked to the intended project.
Open <http://localhost:3000>. `next.config.ts` has `withFlags({})` of
`@flags-sdk/next/plugin`, which generates the code by default: `next dev`
generates `.flags/` and `flags/generated.d.ts` before Next.js resolves the flag imports, and
keeps the catalog subscription open. New keys, variants and descriptions
update `.flags/` automatically. `next build` generates one time, and
`next start` does no catalog work.

The page uses these flags of the linked playground project: `flag0`,
`enable-example-feature`, `fake-hat-checkout-experiment`, `test-string` and
`json-flag`. When you link another project, change the imports of the page.
Use `visitor-1` and `visitor-2` in the visitor form to compare assignments.
The form changes a demo cookie, not the configuration of the provider.

## Sources

Each source is a directory with three files (see [flags/README.md](flags/README.md)):

```text
flags/sources/site/
  catalog.ts   # Default export: a catalog loader. Runs in Node.js at generation.
  provider.ts  # Default export: the OpenFeature provider.
  context.ts   # Default export: getEvaluationContext(request, input).
```

```ts
// flags/sources/site/context.ts
import type { FlagsRequest } from 'flags';

export default function getEvaluationContext(
  request: FlagsRequest | undefined,
) {
  const id = request?.cookies?.get('demo-visitor')?.value ?? 'visitor-1';
  return { user: { id }, visitor: { id } };
}
```

The catalog loader subscribes to `https://flags.vercel.com/v1/stream` with
the OIDC token of the project. The provider gets its own token through
`@vercel/flags-core`. No token is written into the generated modules.

A key with punctuation needs a string import:

```ts
import { 'test-string' as offer } from 'flags:site';
```

`pnpm flags:sync` generates one time without Next.js, and `pnpm flags:watch`
watches the catalogs. Restart `pnpm dev` after a change of a source file, or
after you add or remove a source. `.flags/` has its own `.gitignore`.
The app also ignores `flags/generated.d.ts`, so `pnpm type-check` runs
`flags sync` first.

## Check

From `apps/playground`:

```sh
pnpm type-check   # runs flags sync, then tsc
pnpm test
pnpm build
```

`pnpm test` checks the catalog stream with local fixtures, without OIDC.
`pnpm flags:sync` and `pnpm build` need access to the provider.
