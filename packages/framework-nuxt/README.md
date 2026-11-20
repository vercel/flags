# @flags-sdk/nuxt

The Nuxt package of the [Flags SDK](../flags). It connects the SDK to the
server of Nuxt (Nitro): the current request, `flags/config.ts`, the errors
of Nitro, the lifecycle of the server, discovery for Flags Explorer, and
code generation.

```ts
// nuxt.config.ts
export default defineNuxtConfig({ modules: ['@flags-sdk/nuxt'] });
```

## Features

- **One line of setup.** A module in `nuxt.config.ts`. It also sets the
  async context of Nitro, which the SDK needs.
- **The request in each server route**, with `useEvent()`. No
  `runtime.onInvoke` in your handlers.
- **Errors pass through.** `createError()` reaches Nitro unchanged, also
  from `getEvaluationContext`.
- **The lifecycle.** The providers start with the server and close with it.
- **Discovery** in `nuxt dev` and in the build.
- **Code generation.** Import the flags of a source from `flags:<source>`,
  e.g. `flags:self`.

## Installation

```sh
pnpm add flags @flags-sdk/nuxt
```

Nuxt 4 with Nitro 2. Your code imports only `flags`. `@flags-sdk/nuxt` is
only for the setup.

## Setup

### 1️⃣ Add the module

```ts
// nuxt.config.ts
export default defineNuxtConfig({ modules: ['@flags-sdk/nuxt'] });
```

That is the only required step.

### 2️⃣ Optional: `flags/config.ts`

You do not need a configuration file: each flag names its source, and
overrides work with `FLAGS_SECRET`, or on Vercel, without one. Add
`flags/config.ts` (or `src/flags/config.ts`), next to `flags/sources`, for
settings of all flags: OpenFeature `hooks`, and the options of `overrides`.
It has no source. The module loads it automatically.

```ts
// flags/config.ts
import { defineConfig } from 'flags';

export const config = defineConfig({
  hooks: [myLoggingHook],
});
```

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

Flags run only on the server of Nitro. See the [Flags SDK](../flags) for
flags, the evaluation context, overrides, hooks and tracking.

## Discovery

- Nuxt builds the app with Vite and the server with Nitro. The module adds
  the plugin of `@flags-sdk/vite` to both, so `'use flags'` modules register
  their flags in pages and in server routes.
- `nuxt dev` serves the manifest at `/.well-known/flags/manifest.json`, with
  `no-store`.
- `nuxt build` writes `flags-manifest.json` into `.output/server`.

## Code generation

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [['@flags-sdk/nuxt', { codeGeneration: true }]],
});
```

- Each source is a directory `flags/sources/<source>` with `catalog.ts`,
  `provider.ts` and `context.ts`. By convention, the main source of the
  application is `flags/sources/self`.
- The module generates `.flags/<source>.ts` one time for `nuxt build`, and
  watches the catalogs in `nuxt dev`. It adds the aliases `flags:<source>`
  for Vite and for Nitro:

  ```ts
  import { 'summer-sale' as summerSale } from 'flags:self';
  ```

- Nuxt writes the aliases into its `tsconfig.json`, so the types work
  without `paths`. Add `.flags` to `.gitignore`.
- Without code generation, write `defineSource` and `bindFlag` by hand.
  Each flag names its source. There is no default source.

## How it works

- The module sets `nitro.alias` for `flags/framework` (to
  `@flags-sdk/nuxt/binding`) and `flags/config`, and adds `flags` and
  `@flags-sdk/nuxt` to `nitro.externals.inline`, so that Nitro bundles the
  SDK and the aliases reach it. It points Nitro to its ESM files, so that
  the bundle has one copy of the SDK.
- In development, Nitro loads `flags` from `node_modules`. Thus, the Nitro
  plugin of the module also registers the binding with `registerFramework`
  of `flags/tooling`.
- The binding gets the request with `useEvent()`, and recognizes the errors
  of `createError()` with `isError()`, both from `#imports`, the
  auto-imports of Nitro.
- The module is a plain function which uses the hooks `vite:extendConfig`
  and `nitro:config`, so it does not depend on `@nuxt/kit`.

## License

MIT
