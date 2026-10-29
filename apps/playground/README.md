# Flags protocol playground

A self-contained Next.js demo of provider-owned flags. It uses the workspace
`@vercel/flags-core` package directly. No changes to the published `flags` API
are required.

```ts
import { flag0 } from 'flags:site';

const enabled = await flag0(); // boolean
```

`site` is a connection in `flags.config.ts`. The provider supplies the available
flag keys and variants. The application supplies evaluation context. No flag
needs an application declaration.

## Run

From the repository root, use Node.js 22.19 or later:

```sh
pnpm install
pnpm --filter @vercel/flags-core build
cd apps/playground
vercel link
vercel env pull .env.local
pnpm dev
```

Skip `vercel link` if this app is already linked to the intended project.
Open <http://localhost:3000>. Use `pnpm dev --port 3100` to select another port.

The current page uses these flags from the linked playground project:

- `flag0`
- `fake-hat-checkout-experiment`
- `test-string`
- `json-flag`

When you link another project, change the page imports to flags in that project.
Use `visitor-1` and `visitor-2` in the visitor form to compare the current
playground experiment assignments. Assignments depend on the provider's rules.
The form changes a local demo cookie. It does not change provider configuration.

## Configure a connection

```ts
export const connections = {
  site: defineConnection({
    provider: vercel(),
    async getEvaluationContext({ cookies }) {
      const id = cookies.get('demo-visitor')?.value ?? 'visitor-1';
      return { user: { id }, visitor: { id } };
    },
  }),
};
```

OIDC selects the linked Vercel project and environment. The provider reads
`https://flags.vercel.com/v1/datafile` with `Authorization: Bearer <OIDC token>`.
It uses `@vercel/oidc` to obtain and refresh the token. It does not use `FLAGS`
or `FLAGS_SECRET`. No token is written to generated modules.

The visitor cookie is for this demo. Use trusted session data to identify users
in an application.

## Imports and types

Next.js generates `.flags/site.ts` before development and production builds.
It maps `flags:site` to that module. `tsconfig.json` maps the same import to the
same file for editor completion and type checks. Unknown flags and connections
fail resolution without a custom linter.

Provider keys are preserved. For keys with punctuation, use a string import:

```ts
import { 'test-string' as offer } from 'flags:site';

const value = await offer(); // 'normal' | 'discount-50' | 'discount-20'
```

A direct import gives the same behavior without the `flags:` resolver:

```ts
import { flag0 } from '../.flags/site';
```

To refresh editor types after a provider catalog change, run:

```sh
pnpm flags:sync
```

Next.js picks up changed generated modules during development. Restart it after
adding or removing a connection. The `.flags/` directory is ignored by Git and
contains only the catalog summary and typed server modules. Each generated
module uses `server-only`, so a Client Component cannot import it.

Runtime targeting updates are handled by `@vercel/flags-core`. Catalog sync is
required for new keys or variants. A runtime value that is absent from the
catalog fails with a sync instruction. Rebuild production after a catalog
change. `pnpm start` uses the compiled catalog and does not fetch metadata.
The context schema remains local until
the provider API supports it.

## Check

Run these commands from `apps/playground`:

```sh
pnpm flags:sync
pnpm type-check
pnpm test
pnpm lint
pnpm build
```

`pnpm test` uses local fixtures. It checks generated import types, unknown keys,
context sharing, request isolation, core targeting, and catalog drift. It does
not require OIDC. The sync and build commands require provider access.

Turbopack is the default. The config also includes a Webpack resolver, selected
with `pnpm dev --webpack` or `pnpm build --webpack`.

See [flags/README.md](flags/README.md) for the provider, scope, and framework
boundaries. This is a prototype of the import API, not a complete standard.
