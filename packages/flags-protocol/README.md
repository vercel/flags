# Flags protocol prototype

This private workspace package contains the proposed Flags runtime and tooling.
Its workspace name is `@flags-sdk/protocol`. The playground installs it under the
name `flags` with a relative workspace link:

```json
{
  "dependencies": {
    "flags": "workspace:../../packages/flags-protocol"
  }
}
```

The existing SDK in `packages/flags` remains a separate workspace package.

## Entry points

| Import or command | Responsibility |
| --- | --- |
| `flags` | Catalog, provider, connection, and normalized request contracts; `defineConnection()` and `createScope()`. |
| `flags/next` | Server Component request scope and callable flags. Normalizes Next.js headers and cookies. |
| `flags/next/config` | `withFlags()`: generate and watch during development, generate once during builds, then configure Turbopack and Webpack. No runtime provider or context imports. |
| `flags/tooling` | `generateFlags(directory)` for one snapshot; `watchFlags(directory, { signal })` for continuous updates. Caller supplies environment variables. |
| `flags sync [--production]` | Load Next.js environment files in the current application directory, then generate. |
| `flags watch [--production] [-- command ...args]` | Generate initially and on catalog updates. Start the optional command after initial generation. |

The CLI currently uses Next.js environment-file conventions. The generator and
explicit request scope do not require Next.js. The Next.js config and runtime
have separate entry points so request APIs stay out of config loading.

Next.js applications only need the plugin:

```ts
// next.config.ts
import { withFlags } from 'flags/next/config';

export default withFlags({}, { directory: import.meta.dirname });
```

Use plain `next dev`, `next build`, and `next start` scripts. In development,
the plugin waits for initial generation and keeps watching. During a build it
generates once, then closes the catalog streams. Production startup does no
catalog work. Next.js loads environment files before the plugin runs.

Repeated config loads share one startup promise per application and mode.
Compiler child processes inherit the completed catalog owner's PID and reuse
its output while that process is alive. Development subscriptions stop on
process shutdown. Initial catalog errors fail config loading; later fatal
errors are printed in the terminal with a restart instruction.

## Source contract

Applications own `flags/sources/<name>/` with three default exports:

- `catalog.ts`: a `CatalogLoader` function, safe to run in Node.js. Return one
  catalog or yield complete snapshots from an async iterable.
- `provider.ts`: a `Provider<Context>` instance for runtime evaluation.
- `context.ts`: a function that maps normalized `{ cookies, headers }` to the
  provider's accepted context.

Generation imports only catalogs. It writes `.flags/<name>.ts`, `catalog.json`,
and `manifest.json`. Generated server modules import the application's provider
and context and connect them through this package. They never load the catalog
module. Flag keys, variant types, and JSDoc come from the catalog.

```ts
import type { Catalog, CatalogLoadOptions } from 'flags';

export default async function* loadCatalog({ signal }: CatalogLoadOptions) {
  for await (const snapshot of subscribeToProvider({ signal })) {
    yield snapshot satisfies Catalog;
  }
}
```

`subscribeToProvider` is provider-specific. It must supply an initial snapshot,
then complete snapshots for updates. It owns transport retries and credentials.
It must stop pending work when `signal` is aborted and release resources when
iteration ends. Returning a single catalog remains supported; that source has
no live updates.

Sync consumes the first snapshot and closes the subscriptions. Watch consumes
subsequent snapshots, including flag additions, removals, variant changes, and
descriptions. It serializes writes across sources and replaces changed files
atomically. Unchanged files retain their timestamps. A source error stops the
watcher and keeps the last successfully generated files.

`watchFlags()` resolves once every source has supplied its initial catalog and
the files exist. Its result contains `aliases` and a `done` promise. Await `done`
to observe failures; abort the supplied signal to stop. The CLI handles process
signals and child shutdown for standalone use. Next.js uses `withFlags()` to
own this lifecycle, so it needs no CLI wrapper. Source module edits and source
directory changes require restarting watch or `next dev`.

`createScope()` resolves context once per connection and scope, including a shared
failure. Flag values are not cached by the scope. It checks project/environment
identity and rejects values outside the generated variant set. Explicit scopes
also work in route handlers and jobs without a bundler.

The Vercel catalog and provider implementations, demo descriptions, and visitor
context stay in `apps/playground/flags`. This package has no dependency on that
app or on `@vercel/flags-core`.

## Build and check

From the repository root:

```sh
pnpm --filter @flags-sdk/protocol build
pnpm --filter @flags-sdk/protocol type-check
pnpm --filter @flags-sdk/protocol test
```

Build the package before using the playground. To edit it while the app runs,
use `pnpm --filter @flags-sdk/protocol dev` in another terminal. Tests cover
generated types through the built package exports, discovery without runtime
execution, source removal, streaming updates and cleanup, child process startup,
request isolation, catalog drift, and automatic config generation with shared
subscriptions and build cleanup.

This is an ESM prototype for Node.js 22.19 or later. Provider shutdown, per-call
inputs, and flag-level context transforms remain outside its scope.
