# Playground sources

The playground uses the Flags SDK (`packages/flags`) with code generation.
Each directory in `sources` is a source, and the pages import its flags by
name, e.g. `import { flag0 } from 'flags:site'`.

| File | Responsibility |
| --- | --- |
| `sources/<source>/catalog.ts` | `createCatalogLoader` of `@vercel/flags-core/catalog`: the flags of Vercel Flags, from its stream, with the OIDC token. Adds demo descriptions. Runs at build time and in development only. |
| `sources/<source>/provider.ts` | The OpenFeature provider: `VercelProvider` of `@vercel/flags-core/openfeature`. |
| `sources/<source>/context.ts` | `getEvaluationContext(request, input)`: the visitor from a cookie. |
| `../utils/demo-descriptions.ts` | Sample flag descriptions for the generated JSDoc. |

`withFlags({})` in `next.config.ts` generates `.flags/<source>.ts` and
`flags/generated.d.ts` (the types of `flags:<source>`) one time during
`pnpm build`, and watches the catalogs during `pnpm dev`. `pnpm flags:sync` generates one time without Next.js. The
generated module is a `'use flags'` module with one `defineSource` and one
`bindFlag` for each flag.

A flag whose variants mix types, e.g. objects and `null`, gets the type
`object`, which takes any JSON value, as the object method of OpenFeature
does.

Run `vercel link` and `vercel env pull` for the OIDC token of the project.
