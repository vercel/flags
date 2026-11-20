# @flags-sdk/sveltekit

The SvelteKit package of the [Flags SDK](../flags). It connects the SDK to
SvelteKit: the current request, `flags/config.ts`, the signals of SvelteKit,
discovery for Flags Explorer, and code generation.

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
- **Code generation.** Import the flags of a source from `flags:<source>`,
  e.g. `flags:self`.
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
settings of all flags: OpenFeature `hooks`, and the options of `overrides`.
It has no source. The Vite plugin loads it automatically.

```ts
// flags/config.ts
import { defineConfig } from 'flags';

export const config = defineConfig({
  hooks: [myLoggingHook],
});
```

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

## Code generation

The plugin generates the code by default:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [sveltekit(), flags()],
});
```

- Each source is a directory `src/flags/sources/<source>` with `catalog.ts`,
  `provider.ts` and `context.ts`. By convention, the main source of the
  application is `src/flags/sources/self`. Use `src/flags`, since SvelteKit
  type-checks `src` only.
- The plugin generates `.flags/<source>.ts` one time for `vite build`, and
  watches the catalogs in `vite dev`. It adds the aliases
  `flags:<source>`:

  ```ts
  import { 'summer-sale' as summerSale } from 'flags:self';
  ```

- The types are in `src/flags/generated.d.ts`, so `svelte.config.js` and
  `tsconfig.json` need no change. `.flags` has its own `.gitignore`.
- Without `flags/sources`, the plugin writes nothing. To turn the generation
  off, use `flags({ disableCodeGeneration: true })`.
- Without code generation, write `defineSource` and `bindFlag` by hand.
  Each flag names its source. There is no default source.

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
