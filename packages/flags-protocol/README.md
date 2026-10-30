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
| `flags/next/config` | `withFlags()`: read the generated manifest and configure Turbopack and Webpack. No source or runtime imports. |
| `flags/tooling` | `generateFlags(directory)`: discover sources and write typed modules and a manifest. Caller supplies environment variables. |
| `flags sync [--production]` | Load Next.js environment files in the current application directory, then generate. |

The CLI currently uses Next.js environment-file conventions. The generator and
explicit request scope do not require Next.js. The Next.js config and runtime
have separate entry points so request APIs stay out of config loading.

## Source contract

Applications own `flags/sources/<name>/` with three default exports:

- `catalog.ts`: a `CatalogLoader` function, safe to run in Node.js.
- `provider.ts`: a `Provider<Context>` instance for runtime evaluation.
- `context.ts`: a function that maps normalized `{ cookies, headers }` to the
  provider's accepted context.

Generation imports only catalogs. It writes `.flags/<name>.ts`, `catalog.json`,
and `manifest.json`. Generated server modules import the application's provider
and context and connect them through this package. They never load the catalog
module. Flag keys, variant types, and JSDoc come from the catalog.

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
execution, source removal, request isolation, catalog drift, and config loading.

This is an ESM prototype for Node.js 22.19 or later. Provider shutdown, per-call
inputs, and flag-level context transforms remain outside its scope.
