# Flags playground

A Next.js demo of the Flags SDK (`packages/flags`) with a flags file and
real Vercel Flags. The flags of a source are imports:

```ts
import { flag0 } from 'flags:site';

const enabled = await flag0(); // boolean
```

`site.flags` declares the flags of the source `site`: their names, keys,
types, options and descriptions. The directory `flags/sources/site` has the
provider (`VercelProvider` of `@vercel/flags-core/openfeature`), which
evaluates the flags, and the context module, which creates the evaluation
context from the request. The values, rules and rollouts stay in Vercel
Flags.

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
`@flags-sdk/next/plugin`. It compiles `site.flags`, and writes `.flags/` and
`flags/generated.d.ts` before Next.js resolves the flag imports: one time
for `next build`, and after each change of a flags file for `next dev`.
Nothing is downloaded at build time.

The page uses these flags of the linked playground project: `flag0`,
`fake-hat-checkout-experiment`, `test-string` and `json-flag`. When you link
another project, change `site.flags`.
Use `visitor-1` and `visitor-2` in the visitor form to compare assignments.
The form changes a demo cookie, not the configuration of the provider.

## Sources

Each source is a directory with `provider.ts` and an optional `context.ts` (see [flags/README.md](flags/README.md)):

```text
flags/sources/site/
  provider.ts  # Default export: the OpenFeature provider.
  context.ts   # Optional. Default export: getEvaluationContext(request, input).
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

The provider gets its token through `@vercel/flags-core`. No token is
written into the generated modules.

In `site.flags`, each flag has the name that the page imports, and `key` is
its key in Vercel Flags, e.g. `flag offer { key: "test-string" }`, so a key
with punctuation needs no string import.

`pnpm flags:sync` writes the modules one time without Next.js, and
`pnpm flags:watch` writes them again after each change of a flags file.
Restart `pnpm dev` after you add or remove a source. `.flags/` has its own `.gitignore`.
The app also ignores `flags/generated.d.ts`, so `pnpm type-check` runs
`flags sync` first.

## Check

From `apps/playground`:

```sh
pnpm type-check   # runs flags sync, then tsc
pnpm build
```

`pnpm flags:sync` needs no credentials. `pnpm build` needs access to the
provider.
