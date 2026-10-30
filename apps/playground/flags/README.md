# Playground sources

This folder contains application-owned sources and demo descriptions. The shared
runtime, generator, CLI, Next.js integration, and their tests live in
[`packages/flags-protocol`](../../../packages/flags-protocol/README.md).

| File | Responsibility |
| --- | --- |
| `sources/site/catalog.ts` | Convert streamed Vercel datafiles into catalog snapshots for sync and watch. |
| `sources/site/stream.ts` | Subscribe to `/v1/stream` with OIDC, parse NDJSON, reconnect, and close on cancellation. |
| `sources/site/provider.ts` | Evaluate flags through `@vercel/flags-core`. Creates the client on first use. |
| `sources/site/context.ts` | Map normalized `{ cookies, headers }` to provider context. No framework imports. |
| `demo-descriptions.ts` | Supply sample flag descriptions for generated JSDoc. |
| `catalog.test.ts` | Check stream parsing, reconnects, cancellation, and catalog metadata without network access. |

The source imports contracts from `flags`, which is a workspace alias for the
new protocol package. Application code imports flags from `flags:site`.

The directory name registers the source. Each directory needs all three files;
there is no central config. Generation imports only `catalog.ts`. The generated
server module imports `provider.ts` and `context.ts` and assembles the connection.

`pnpm dev` starts catalog watch before Next.js. `pnpm flags:watch` watches without
starting the app. `pnpm flags:sync` takes the first snapshot and exits. The stream
receives a complete datafile on connection and after changes. It uses a new OIDC
token on reconnect, ignores pings and older revisions, and retains generated
files during a connection failure. Authentication errors stop the watcher.

The context function receives read methods: `cookies.get(name)` returns
`{ value: string }` or `undefined`; `headers.get(name)` is case-insensitive and
returns a string or `null`. A request scope resolves this context once for all
flags from the same source. The visitor cookie is demo identity data.

The Vercel API does not yet supply a context schema or flag descriptions.
Context remains `Record<string, unknown>`, and JSDoc uses the demo descriptions.
Replace those descriptions with provider metadata when available.
