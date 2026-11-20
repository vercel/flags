# @flags-sdk/nuxt

The Nuxt package of the [Flags SDK](../flags). It connects the SDK to the
server of Nuxt (Nitro): the current request, the configuration files, the errors
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

### 2️⃣ Optional: the configuration files

You do not need a configuration file: each flag names its source, and
overrides work with `FLAGS_SECRET`, or on Vercel, without one. The folder `flags` (or `src/flags`),
next to `flags/sources`, can have one file for each part of the
configuration of all flags. None of them has a source:

- `flags/hooks.ts`: the OpenFeature hooks for all flags, as the default
  export.
- `flags/overrides.ts`: the options of the overrides, as the default export.
- `flags/config.json`: the static settings, e.g. `"selfSource": false`.

The module loads them automatically. In development, a change applies without a restart.

```ts
// flags/hooks.ts
import type { Hook } from 'flags';

const hooks: Hook[] = [myLoggingHook];

export default hooks;
```

See [Configuration](https://flags-sdk.dev/docs/flags/configuration).

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

The module generates the code by default:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@flags-sdk/nuxt'],
});
```

- Each source is a directory `flags/sources/<source>` with `catalog.ts`,
  `provider.ts`, and an optional `context.ts` and `hooks.ts`. By convention, the main source of the
  application is `flags/sources/self`.
- With `@vercel/flags-core` in the dependencies, the source `self` is the
  default source of Vercel Flags, also without `flags/sources/self`:
  `new VercelProvider()` and the catalog of `@vercel/flags-core/catalog`.
  Each file in `flags/sources/self` replaces its part, e.g.
  `context.ts` adds an evaluation context. Without the credentials of
  `vercel env pull`, `flags:self` has no flags and the SDK warns. To turn
  the default source off, set `"selfSource": false` in `flags/config.json`.
- The module generates `.flags/<source>.ts` one time for `nuxt build`, and
  watches the catalogs in `nuxt dev`. It adds the aliases `flags:<source>`
  for Vite and for Nitro:

  ```ts
  import { 'summer-sale' as summerSale } from 'flags:self';
  ```

- The types are in `flags/generated.d.ts`. The module adds the file to the
  types of Nuxt (hook `prepare:types`), so the types work without `paths`.
  `.flags` has its own `.gitignore`.
- Without `flags/sources` and without the default source, the module
  writes nothing. To turn the
  generation off, use
  `modules: [['@flags-sdk/nuxt', { disableCodeGeneration: true }]]`.
- Without code generation, write `defineSource` and `bindFlag` by hand.
  Each flag names its source. The runtime has no global source.

## How it works

- The module sets `nitro.alias` for `flags/framework` (to
  `@flags-sdk/nuxt/binding`), and for `flags/hooks`, `flags/overrides` and
  `flags/settings` (to `flags/hooks.ts`, `flags/overrides.ts` and
  `flags/config.json`, if they exist). It adds `flags` and
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
