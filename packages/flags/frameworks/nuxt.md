# Flags SDK with Nuxt

Status: the module `flags/nuxt` gives the server of Nitro the framework
binding (the request and `flags.config.ts`), registers `'use flags'`
modules, and writes the manifest of the flags. `tests/standard/nuxt` tests
it with Nuxt 4.6 and Nitro 2, in the build and in `nuxt dev`.

## Setup

```ts
// nuxt.config.ts
export default defineNuxtConfig({ modules: ['flags/nuxt'] });
```

That is the only required step. The module sets
`nitro.experimental.asyncContext`, which the binding needs.

## Optional: `flags.config.ts`

Put it in the directory of the project or in `src`. It can use the
auto-imports of Nitro, e.g. `createError` from `#imports`.

## Usage

```ts
// server/api/flags.get.ts
import { evaluate } from 'flags';
import { bannerText, summerSale } from '../../lib/flags';

export default defineEventHandler(async () => {
  const [sale, banner] = await evaluate([summerSale, bannerText]);
  return { sale, banner };
});
```

- Flags run only on the server of Nitro.
- An error of `createError()` passes through the SDK, also from
  `getEvaluationContext`.
- A Nitro plugin of the module initializes the providers at the start, and
  closes them when the server stops.

## Discovery

- Nuxt builds the app with Vite and the server with Nitro. The module adds
  the plugin of `flags/vite` to both, so `'use flags'` modules register
  their flags in pages and in server routes.
- `nuxt dev` serves the manifest at `/.well-known/flags/manifest.json`, with
  `no-store`.
- `nuxt build` writes `flags-manifest.json` into `.output/server` (the
  build of Nitro).

## How it works

- `flags/nuxt` sets `nitro.alias` for `flags/framework` (to
  `flags/nuxt/runtime`) and `flags/config`, and adds `flags` to
  `nitro.externals.inline`, so that Nitro bundles the SDK and the aliases
  reach it.
- The binding gets the request with `useEvent()` of `#imports`. It imports
  nothing else from Nitro or h3, so the SDK does not depend on them.
- The module is a plain function which uses the hooks `vite:extendConfig`
  and `nitro:config`, so the SDK does not depend on `@nuxt/kit`.
