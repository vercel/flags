# Upgrading from v4

Version 5 turns the Flags SDK into a standard for every JavaScript framework, built on OpenFeature. Flags as code, server-side evaluation and Flags Explorer overrides stay. The API changed. Ask the user before you upgrade an app. Do not mix v4 and v5 APIs in one app.

Full guide: https://flags-sdk.dev/docs/getting-started/upgrading-from-v4

## What changed

| v4                                                              | v5                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `flag({ key, decide })` from `flags/next` or `flags/sveltekit`  | `defineFlag({ key, decide })` from `flags` (inline flag)                                    |
| `flag({ key, adapter })` with an adapter of `@flags-sdk/*`      | `source.bindFlag(key)` on a source of an OpenFeature provider                               |
| `identify` of each flag                                         | `getEvaluationContext` of the source (or `context.ts`), and of the flag if needed           |
| `dedupe`                                                        | Built in: each flag and each context step runs once per request                            |
| `evaluate` from `flags/next`                                    | `evaluate` from `flags`                                                                    |
| `flags/next`, `flags/sveltekit` imports in app code             | App code imports only `flags`. Setup packages: `@flags-sdk/next`, `@flags-sdk/sveltekit`, ... |
| `precompute`, `generatePermutations` from `flags/next`          | The same API in `@flags-sdk/next/precompute`                                               |
| A flag called as `flag(code, group)` on a precomputed page      | `getPrecomputed(flag, group, code)`                                                        |
| `encryptOverrides`, `decryptOverrides`, `encryptFlagValues`, `decryptFlagValues` from `flags` | The same functions from `flags/explorer` |
| `FlagValues` from `flags/react`                                 | `FlagValues` from `@flags-sdk/next/flag-values`, encrypted by default                      |
| `/.well-known/vercel/flags` with `getProviderData`              | The flags manifest of `'use flags'` modules (`app/.well-known/flags/manifest.json/route.ts`) |
| `vercelAdapter` of `@flags-sdk/vercel`                          | `new VercelProvider()` of `@vercel/flags-core/openfeature`                                  |
| `createVercelAdapter({ projectId })`                            | `new VercelProvider(createClient({ projectId }))`                                           |
| `FLAGS_SECRET` needed for Flags Explorer                        | Optional on Vercel: Vercel signs override cookies                                           |
| Next.js and SvelteKit                                           | Next.js, SvelteKit, Nuxt, TanStack Start, Hono, Express, no framework                       |

- v4 override cookies (`vercel-flag-overrides`, encrypted with `FLAGS_SECRET`) still work.
- v4 precompute codes stay valid if you set `FLAGS_PRECOMPUTE_SECRET` to the old `FLAGS_SECRET` during the upgrade.
- `decide` now receives `(request, context)` instead of `{ headers, cookies, entities }`. Read cookies with `request?.cookies?.get(name)?.value`.
- Each provider flag is declared on its source, with `source.bindFlag(key)` or in a flags file (`app.flags`). With `@vercel/flags-core`, the source `self` of the flags files needs no `provider.ts`.
- Set `type` for each flag that is not a boolean. v5 does not infer it from `defaultValue`.

## Inline flags

```ts
// v4: flags.ts
import { flag } from 'flags/next';

export const betaBanner = flag<boolean>({
  key: 'betaBanner',
  options: [false, true],
  decide({ cookies }) {
    return cookies.get('beta')?.value === '1';
  },
});
```

```ts
// v5: flags.ts
'use flags';

import { defineFlag } from 'flags';

export const betaBanner = defineFlag({
  key: 'betaBanner',
  options: [false, true] as const,
  decide: (request) => request?.cookies?.get('beta')?.value === '1',
});
```

## Flags of a provider

```ts
// v4: flags.ts
import { flag } from 'flags/next';
import { vercelAdapter } from '@flags-sdk/vercel';

export const summerSale = flag<boolean, { user: { id: string } }>({
  key: 'summerSale',
  adapter: vercelAdapter(),
  identify({ cookies }) {
    return { user: { id: cookies.get('user-id')?.value ?? 'anonymous' } };
  },
});
```

```ts
// v5: flags.ts
'use flags';

import { defineSource } from 'flags';
import { VercelProvider } from '@vercel/flags-core/openfeature';

const self = defineSource({
  provider: new VercelProvider(),
  project: { system: 'vercel-flags' },
  getEvaluationContext: (request) => ({
    user: { id: request?.cookies?.get('user-id')?.value ?? 'anonymous' },
  }),
});

export const summerSale = self.bindFlag('summerSale');
```

Or use flags files instead: the flags go into `app.flags` (e.g. `flag summerSale { defaultValue: false }`), the provider into `flags/sources/self/provider.ts` (not needed for Vercel with `@vercel/flags-core`), the old `identify` into `flags/sources/self/context.ts`, and you import `import { summerSale } from './app.flags'` or `from 'flags:self'`. See [flags-files.md](flags-files.md).

Other vendors: replace the adapter with the vendor's OpenFeature provider ([providers.md](providers.md#openfeature-providers)). Statsig and PostHog have providers in `@flags-sdk/statsig/openfeature` and `@flags-sdk/posthog/openfeature`. Reflag stays on v4.

## Step by step

1. Install `flags@5` and the package of your framework.
2. Add the framework setup, e.g. `withFlags` in `next.config.ts` (as the outer plugin).
3. Replace each provider adapter with a source of its OpenFeature provider: a folder `flags/sources/<source>/` with flags files, or `defineSource` by hand.
4. Replace `flag()` with `defineFlag()` for flags with `decide`, and with `source.bindFlag(key)` (or a `flag` block in a flags file) for provider flags. Set `type` for each flag that is not a boolean.
5. Move `identify` to `getEvaluationContext(request, input)` of the source, or to the default export of `context.ts`. Remove `dedupe`.
6. Add `'use flags'` to the flags modules. Move other exports (sources, precompute groups, helpers) to other modules.
7. Remove `app/.well-known/vercel/flags/route.ts`. Add `app/.well-known/flags/manifest.json/route.ts` with `export { GET } from '@flags-sdk/next/manifest';`.
8. Move precompute imports to `@flags-sdk/next/precompute`, and read values with `getPrecomputed`.
9. Move `FlagValues` to `@flags-sdk/next/flag-values` (prop `flags` or `values`).
10. Remove `@flags-sdk/vercel` and other v4 adapters when nothing imports them.
11. Run the type check (`flags sync && tsc --noEmit`) and the build. The types point to the remaining changes.
