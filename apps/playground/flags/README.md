# Playground sources

This folder contains application-owned sources and demo descriptions. The shared
runtime, generator, CLI, Next.js integration, and their tests live in
[`packages/flags-protocol`](../../../packages/flags-protocol/README.md).

| File | Responsibility |
| --- | --- |
| `sources/site/catalog.ts` | Fetch the Vercel datafile with OIDC and return catalog metadata. Runs during sync. |
| `sources/site/provider.ts` | Evaluate flags through `@vercel/flags-core`. Creates the client on first use. |
| `sources/site/context.ts` | Map normalized `{ cookies, headers }` to provider context. No framework imports. |
| `demo-descriptions.ts` | Supply sample flag descriptions for generated JSDoc. |
| `source.test.ts` | Check the source context and real core evaluator without Next.js or network access. |

The source imports contracts from `flags`, which is a workspace alias for the
new protocol package. Application code imports flags from `flags:site`.

The directory name registers the source. Each directory needs all three files;
there is no central config. Generation imports only `catalog.ts`. The generated
server module imports `provider.ts` and `context.ts` and assembles the connection.

The context function receives read methods: `cookies.get(name)` returns
`{ value: string }` or `undefined`; `headers.get(name)` is case-insensitive and
returns a string or `null`. A request scope resolves this context once for all
flags from the same source. The visitor cookie is demo identity data.

The Vercel API does not yet supply a context schema or flag descriptions.
Context remains `Record<string, unknown>`, and JSDoc uses the demo descriptions.
Replace those descriptions with provider metadata when available.
