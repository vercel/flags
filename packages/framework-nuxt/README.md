# @flags-sdk/nuxt

The Nuxt package of the [Flags SDK](../flags). It connects the SDK to the
server of Nuxt (Nitro): the current request, `flags.config.ts`, the errors
of Nitro, the lifecycle of the server, discovery for Flags Explorer, and
the default provider of the platform.

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
- **Discovery** in `nuxt dev` and in the build, and the **default provider**
  of Vercel for builds on Vercel.

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

### 2️⃣ Optional: `flags.config.ts`

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

Flags run only on the server of Nitro. See the [Flags SDK](../flags) for
flags, the evaluation context, overrides, hooks and tracking.

## Discovery

- Nuxt builds the app with Vite and the server with Nitro. The module adds
  the plugin of `@flags-sdk/vite` to both, so `'use flags'` modules register
  their flags in pages and in server routes.
- `nuxt dev` serves the manifest at `/.well-known/flags/manifest.json`, with
  `no-store`.
- `nuxt build` writes `flags-manifest.json` into `.output/server`.

## Deployment

- On Vercel, a build sets `VERCEL`. If the project has `@vercel/flags-core`,
  the module replaces `flags/default-provider` with
  `@vercel/flags-core/default-provider` in Nitro. Development uses OFREP.
- A `defaultConnection` in `flags.config.ts` always wins.
- An other platform, or a test, gives the module of its provider:
  `modules: [['@flags-sdk/nuxt', { defaultProvider: './provider.ts' }]]`.

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
