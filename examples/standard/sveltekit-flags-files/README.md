# Demo: SvelteKit with flags files

The Flags SDK with SvelteKit and a flags file. The flags of the app are in
`src/app.flags`, and the page imports them from the file:

```ts
import { enableSale } from '../app.flags';
```

- `src/app.flags`: the flags of the source `self` (the default). Each
  `flag <name> { … }` is one flag.
- `src/flags/sources/self/provider.ts`: the OpenFeature provider.
- `src/flags/sources/self/context.ts`: `getEvaluationContext(request, input)`.

SvelteKit type-checks the `src` folder only, so the flags file and the
folder `flags` are in `src`. The SDK finds `flags/sources` in the root of the
app, or else in `src`.

`flags()` in `vite.config.ts` compiles each flags file into one
`defineSource` and one `source.bindFlag` for each flag. Nothing is
downloaded. For TypeScript, it writes `app.d.flags.ts` next to each flags
file (`allowArbitraryExtensions` is on in `tsconfig.json`, and Git ignores
the files). It also writes `.flags/self.ts` and `src/flags/generated.d.ts`,
so the app can also import the flag from its source:
`import { enableSale } from 'flags:self'`.

```sh
pnpm --filter flags --filter @flags-sdk/vite --filter @flags-sdk/sveltekit build
pnpm dev    # set the cookie user=alice to see the sale
pnpm check  # flags sync, then svelte-check
pnpm test   # builds, then tests the build with Node.js
```
