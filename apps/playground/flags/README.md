# Playground sources

The playground declares its flags in `site.flags`, a flags file of the
source `site`, and the page imports them from the source:
`import { flag0 } from 'flags:site'`.

| File | Responsibility |
| --- | --- |
| `../site.flags` | The flags: name, key, type, options and description. The values stay in Vercel Flags. |
| `sources/<source>/provider.ts` | The OpenFeature provider: `VercelProvider` of `@vercel/flags-core/openfeature`. |
| `sources/<source>/context.ts` | `getEvaluationContext(request, input)`: the visitor from a cookie. |

`withFlags({})` in `next.config.ts` compiles the flags files, and writes
`.flags/<source>.ts` and `flags/generated.d.ts` (the types of
`flags:<source>`) one time during `pnpm build`, and after each change of a
flags file during `pnpm dev`. `pnpm flags:sync` writes them one time
without Next.js. Nothing is downloaded at build time.

Run `vercel link` and `vercel env pull` for the OIDC token of the project.
