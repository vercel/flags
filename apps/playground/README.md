# Flags protocol playground

A Next.js demo of provider-owned flags. The proposed runtime and tooling live in
`packages/flags-protocol`. The playground installs that package as `flags` with
`"flags": "workspace:../../packages/flags-protocol"`. The existing SDK in
`packages/flags` is unchanged. The source provider uses the workspace
`@vercel/flags-core` directly.

```ts
import { flag0 } from 'flags:site';

const enabled = await flag0(); // boolean
```

`site` is the directory `flags/sources/site`. Its catalog supplies flag keys and
variants. Its provider evaluates flags, and its context module identifies the
request. No flag needs an application declaration or central registration.

## Run

From the repository root, use Node.js 22.19 or later:

```sh
pnpm install
pnpm --filter @flags-sdk/protocol build
pnpm --filter @vercel/flags-core build
cd apps/playground
vercel link
vercel env pull .env.local
pnpm dev
```

Skip `vercel link` if this app is already linked to the intended project.
Open <http://localhost:3000>. Use `pnpm dev --port 3100` to select another port.
`pnpm dev` generates the initial flag catalog, starts Next.js, and keeps a catalog
subscription open. New keys, variants, and descriptions update `.flags/`
automatically. Ctrl+C stops both the watcher and Next.js.
Rebuild `@flags-sdk/protocol` after editing its source, or run
`pnpm --filter @flags-sdk/protocol dev` in another terminal to watch it.

The current page uses these flags from the linked playground project:

- `flag0`
- `enable-example-feature`
- `fake-hat-checkout-experiment`
- `test-string`
- `json-flag`

When you link another project, change the page imports to flags in that project.
Use `visitor-1` and `visitor-2` in the visitor form to compare the current
playground experiment assignments. Assignments depend on the provider's rules.
The form changes a local demo cookie. It does not change provider configuration.

`app/example-feature.tsx` is an async Server Component. It imports
`enable-example-feature` from `flags:site` and shows the feature only when the
flag returns `true`. When it returns `false`, the component shows an off message.
Change the flag in Vercel Flags, then reload the page to see the result for the
current visitor. No catalog sync is needed to switch an existing boolean flag.
The page call counter covers the four calls in `app/page.tsx`; the component
makes one additional call with the same request context.

## Configure a source

Create one directory per source, with these three files:

```text
flags/sources/site/
  catalog.ts   # Default export: a catalog loader. Yields snapshots in Node.js.
  provider.ts  # Default export: a runtime provider. Loaded by the application.
  context.ts   # Default export: a context resolver. Called once per request.
```

The directory name selects the import: `flags:site`. Names must start with a
letter and contain only letters, digits, underscores, or dashes. Each source
must contain all three files. The generator checks their paths, but only imports
`catalog.ts`. Its dependencies must work in ordinary Node.js.

The Vercel implementation lives directly in these files. `catalog.ts` yields
metadata from the datafile subscription in `stream.ts`. `provider.ts` exports an
evaluator that creates its `@vercel/flags-core` client on the first call.

```ts
// flags/sources/site/context.ts
import type { RequestInputs } from 'flags';

export default async function getEvaluationContext({ cookies }: RequestInputs) {
  const id = cookies.get('demo-visitor')?.value ?? 'visitor-1';
  return { user: { id }, visitor: { id } };
}
```

The request scope calls the context resolver with normalized
`{ cookies, headers }` supplied by the framework adapter. Both expose read methods:

- `cookies.get(name)` returns `{ value: string }` or `undefined`.
- `headers.get(name)` uses case-insensitive lookup and returns a string or `null`.

The source uses no Next.js request APIs. The same context function works with
any framework adapter that supplies this contract. The Next.js adapter reads
the request APIs and wraps them in this view. Generated connection code checks
that the resolver returns the context type accepted by the provider. Generated
modules enforce the server boundary in Next.js.

OIDC selects the linked Vercel project and environment for both source modules.
The catalog loader subscribes to
`https://flags.vercel.com/v1/stream` with `Authorization: Bearer <OIDC token>`.
The endpoint sends newline-delimited JSON with an initial datafile and updates.
It uses `@vercel/oidc` to obtain a token for each connection. It does not use `FLAGS`
or `FLAGS_SECRET`. Runtime obtains its own token through `@vercel/flags-core`.
No token is written to generated modules. For a provider that needs explicit
project settings, both modules can import a shared settings file that is safe
to load in Node.js. Neither catalog code nor shared settings may import the
runtime provider or context module.

The visitor cookie is for this demo. Use trusted session data to identify users
in an application.

## Imports and types

`pnpm dev` runs `flags watch -- next dev`. `pnpm build` runs `flags:sync` once
before building. Both write `.flags/site.ts`, a catalog summary, and a resolution
manifest. `next.config.ts`
uses `withFlags()` from `flags/next/config`. That entry only reads the manifest
to map `flags:site` to its generated module. It does not load source modules or
contact a provider. `tsconfig.json` maps the same import
to the same file for editor completion and type checks. Unknown flags and
connections fail resolution without a custom linter.

Provider keys are preserved. For keys with punctuation, use a string import:

```ts
import { 'test-string' as offer } from 'flags:site';

const value = await offer(); // 'normal' | 'discount-50' | 'discount-20'
```

A direct import gives the same behavior without the `flags:` resolver:

```ts
import { flag0 } from '../.flags/site';
```

To watch editor types without running Next.js, run:

```sh
pnpm flags:watch
```

To refresh once and exit, run:

```sh
pnpm flags:sync
```

Next.js picks up changed generated modules during development. Restart `pnpm dev`
after changing source modules or adding or removing a source directory. The
`.flags/` directory is ignored by Git and contains the catalog summary,
resolution manifest, and typed server modules.
Each generated module uses `server-only`, so a Client Component cannot import it.

Runtime targeting updates are handled by `@vercel/flags-core`. Catalog watch
updates the imports and types for new keys or variants. A runtime value that is
absent from the catalog fails with a sync instruction. Rebuild production after a catalog
change. `pnpm start` uses the compiled catalog and does not fetch metadata.
The catalog stream reconnects after a connection failure and keeps existing files
until new data arrives. Authentication failures stop watch with a refresh
instruction. Initial connection failures stop startup. Unchanged modules are not
rewritten, and changed files are replaced atomically.
The context schema remains broad until the provider API supports it.

## Check

Run these commands from `apps/playground`:

```sh
pnpm flags:sync
pnpm type-check
pnpm test
pnpm lint
pnpm build
```

The app tests check catalog parsing, stream updates, reconnects, and cancellation
with local fixtures. Run `pnpm --filter @flags-sdk/protocol test` from the repo root
for the shared package tests: module separation, generated types, source
discovery, continuous generation, context sharing, request isolation, and catalog
drift. Tests do not require OIDC. The sync and app build commands require provider
access.

Turbopack is the default. The config also includes a Webpack resolver, selected
with `pnpm dev --webpack` or `pnpm build --webpack`.

See [flags/README.md](flags/README.md) for the application source files and
[the package README](../../packages/flags-protocol/README.md) for shared
contracts and framework integration. This is a prototype of the import API,
not a complete standard.
