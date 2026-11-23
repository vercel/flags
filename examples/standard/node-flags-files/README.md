# Demo: flags files in plain Node.js

A plain Node.js HTTP server, without a framework and without a bundler. The
flags of the application are in `src/app.flags`, and the server imports
them:

```ts
import { checkout, summerSale } from './app.flags';
```

- `src/app.flags`: the flags of the source `self`. Each `flag <name> { … }`
  is one flag, with its key in the flag management system.
- `flags/sources/self/provider.ts`: the OpenFeature provider, here an
  in-memory provider.
- `flags/sources/self/context.ts`: `getEvaluationContext(request)`, from
  the cookies `user` and `beta`.

`node --import flags/register` compiles each flags file when Node.js
imports it: one `defineSource` and one `source.bindFlag` for each flag. It
needs Node.js 22.15 or newer.

For the types, `flags/register` writes `src/app.d.flags.ts` next to the
flags file each time it compiles it (`allowArbitraryExtensions` is on in
`tsconfig.json`, and Git ignores the file). Every editor reads it. While
you edit the flags file without the server, `npx flags watch` writes it
again after each change.

`tsconfig.json` also has the content mapper of `flags` (`contentMappers`).
With it, TypeScript 7.1 reads the flags file itself (`tsc
--runExternalCode`), and the editor goes from an import to the flag in
`app.flags`, if it runs TypeScript 7.1 with external code allowed (in VS
Code: the extension of TypeScript 7 and `packages/vscode-flags`).

```sh
pnpm --filter flags build
pnpm start   # http://localhost:4440, try the cookies user=alice and beta=1
pnpm test
pnpm type-check:content-mapper
```

`type-check:content-mapper` needs Node.js 24. On Node.js 22,
`node_modules/.bin/tsc` of TypeScript 7.1 beta starts the native `tsc`
with an empty environment, so it does not find `node` for the content
mapper. Thus the script is not `type-check`, which `pnpm type-check` of
the repository runs.
