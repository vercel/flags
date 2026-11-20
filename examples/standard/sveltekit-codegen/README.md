# Demo: SvelteKit with code generation

The Flags SDK with SvelteKit and the file system API. The source `self` is
the folder `src/flags/sources/self`:

- `catalog.ts`: the flags, for the code generation only
- `provider.ts`: the OpenFeature provider
- `context.ts`: `getEvaluationContext(request, input)`

SvelteKit type-checks the `src` folder only, so the flags folder is in `src`.
The SDK finds `flags/sources` in the root of the app, or else in `src`.

`flags()` in `vite.config.ts` writes `.flags/self.ts` and points `flags:self`
to it. It also writes `src/flags/generated.d.ts`, the types of `flags:self`,
so `svelte.config.js` and `tsconfig.json` need no change. The page imports
the flag:

```ts
import { enableSale } from 'flags:self';
```

```sh
pnpm --filter flags --filter @flags-sdk/vite --filter @flags-sdk/sveltekit build
pnpm dev    # set the cookie user=alice to see the sale
pnpm check  # flags sync, then svelte-check
pnpm test   # builds, then tests the build with Node.js
```
