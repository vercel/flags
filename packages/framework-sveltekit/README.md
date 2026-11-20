# @flags-sdk/sveltekit

The SvelteKit package of the [Flags SDK](../flags). It connects the SDK to
SvelteKit: the current request, `flags/config.ts`, the signals of SvelteKit,
discovery for Flags Explorer, and the default provider of the platform.

```ts
// vite.config.ts
export default defineConfig({ plugins: [sveltekit(), flags()] });
```

## Features

- **One line of setup.** `flags()` in `vite.config.ts`. No `handle` hook.
- **The request everywhere on the server**, with `getRequestEvent()`: in
  `load`, actions, `+server.ts` and hooks.
- **Signals pass through.** `redirect()` and `error()` reach SvelteKit
  unchanged, also from `getEvaluationContext`.
- **Fast on Vercel.** A build on Vercel uses the fast provider of Vercel
  Flags.
- **Discovery.** A manifest of your flags for Flags Explorer, in `vite dev`
  and in the build.

## Installation

```sh
pnpm add flags @flags-sdk/sveltekit
```

SvelteKit 2.20 or newer, and Vite 6 or newer. Your code imports only
`flags`. `@flags-sdk/sveltekit` is only for the setup.

## Setup

### 1️⃣ Add the plugin

```ts
// vite.config.ts
import { flags } from '@flags-sdk/sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit(), flags()],
});
```

That is the only required step.

### 2️⃣ Optional: `flags/config.ts`

You do not need a configuration file: each flag names its source, and
overrides work with `FLAGS_SECRET`, or on Vercel, without one. Add
`flags/config.ts` (or `src/flags/config.ts`), next to `flags/sources`, for
settings of all flags: OpenFeature `hooks`, the options of `overrides`, or
a `defaultSource` for flags without a source. The Vite plugin loads it automatically.

```ts
// flags/config.ts
import { defineConfig } from 'flags';

export const config = defineConfig({
  hooks: [myLoggingHook],
});
```

In a build on Vercel, flags without a source use the fast provider of
`@vercel/flags-core`, if the project has it.

## Usage

```ts
// src/routes/+page.server.ts
import { evaluate } from 'flags';
import { bannerText, summerSale } from '../lib/flags';

export async function load() {
  const [sale, banner] = await evaluate([summerSale, bannerText]);
  return { sale, banner };
}
```

- Flags run only on the server.
- To initialize the providers before the first request, call
  `runtime.onInit()` in `init` of `hooks.server.ts`.

See the [Flags SDK](../flags) for flags, the evaluation context, overrides,
hooks and tracking.

## Discovery

- Modules which start with `'use flags'` register their flags.
- `vite dev` serves the manifest at `/.well-known/flags/manifest.json`, with
  `no-store`.
- `vite build` writes `flags-manifest.json` into the server output
  (`.svelte-kit/output/server`). `adapter-node` copies it into
  `build/server`.

## Deployment

- On Vercel, a build sets `VERCEL`. If the project has `@vercel/flags-core`,
  the plugin replaces `flags/default-provider` with
  `@vercel/flags-core/default-provider`. Flags without a source then
  use the fast provider of Vercel Flags. Development uses `flags/config.ts`.
- A `defaultSource` in `flags/config.ts` always wins.
- An other platform, or a test, gives the module of its provider:
  `flags({ defaultProvider: './src/provider.ts' })`. The module exports
  `createDefaultProvider()`.
- The adapter of SvelteKit runs after the build of Vite, so it is too late
  for an alias. Thus, the plugin sets it.

## How it works

- `flags()` points `flags/framework` to `@flags-sdk/sveltekit/binding` and
  `flags/config` to `flags/config.ts`. It bundles `flags` and
  `@flags-sdk/sveltekit` into the server code (`ssr.noExternal`), because
  an alias only reaches the SDK when the bundler processes it.
- The binding gets the request with `getRequestEvent()`. The headers of the
  request identify it, so the SDK creates the evaluation context and
  evaluates each flag one time for each request.
- The binding uses `isRedirect()` and `isHttpError()` of `@sveltejs/kit`.
  The plugin deduplicates `@sveltejs/kit`, so that the binding and your
  code use one copy.
- In `vite dev`, `flags/config.ts` is loaded again before each evaluation.

## Gotchas

- **The export must be `config`.** A default export of `flags/config.ts` is
  not read.
- **Prerendered pages have no request.** Their flags use the evaluation
  context without a request.

## License

MIT
