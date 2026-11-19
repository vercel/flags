# Playground sources

The playground uses the Flags SDK (`packages/flags`) with code generation.
Each directory in `sources` is a source, and the pages import its flags by
name, e.g. `import { flag0 } from 'flags:site'`.

| File | Responsibility |
| --- | --- |
| `sources/<source>/catalog.ts` | Convert streamed Vercel datafiles into catalogs for `flags sync` and `flags watch`. Runs at build time and in development only. |
| `sources/<source>/stream.ts` | Subscribe to `/v1/stream` with OIDC, parse NDJSON, reconnect, and close on cancellation. |
| `sources/<source>/provider.ts` | The OpenFeature provider: `VercelProvider` of `@vercel/flags-core/openfeature`. |
| `sources/<source>/context.ts` | `getEvaluationContext(input, request)`: the visitor from a cookie. |
| `../utils/demo-descriptions.ts` | Sample flag descriptions for the generated JSDoc. |
| `../utils/catalog.test.ts` | Stream parsing, reconnects, cancellation, and catalog data, without network access. |

`withFlags({}, { codeGeneration: true })` in `next.config.ts` generates
`.flags/<source>.ts` one time during `pnpm build`, and watches the catalogs
during `pnpm dev`. `pnpm flags:sync` generates one time without Next.js. The
generated module is a `'use flags'` module with one `defineSource` and one
`bindFlag` for each flag.

A flag whose variants mix types, e.g. objects and `null`, gets the type
`object`, which takes any JSON value, as the object method of OpenFeature
does.

Run `vercel link` and `vercel env pull` for the OIDC token of the project.
