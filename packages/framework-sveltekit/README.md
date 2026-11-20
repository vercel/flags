# @flags-sdk/sveltekit

The SvelteKit package of the [Flags SDK](../flags). It connects the SDK to
SvelteKit: the current request, the configuration files, the signals of SvelteKit,
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

### 2️⃣ Optional: the configuration files

You do not need a configuration file: each flag is declared on its source, and
overrides work with `FLAGS_SECRET`, or on Vercel, without one. The folder `flags` (or `src/flags`),
next to `flags/sources`, can have one file for each part of the
configuration of all flags. None of them has a source:

- `flags/hooks.ts`: the OpenFeature hooks for all flags, as the default
  export.
- `flags/overrides.ts`: the options of the overrides, as the default export.
- `flags/config.json`: the static settings, e.g. `"selfSource": false`.

The Vite plugin loads them automatically. In development, a change applies without a restart.

```ts
// src/flags/hooks.ts
import type { Hook } from 'flags';

const hooks: Hook[] = [myLoggingHook];

export default hooks;
```

See [Configuration](https://flags-sdk.dev/docs/flags/configuration).

## Usage

```ts
// src/routes/+page.server.ts
import { bannerText, summerSale } from '../lib/flags';

export async function load() {
  const sale = await summerSale();
  const banner = await bannerText();
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
  `provider.ts`, and an optional `context.ts` and `hooks.ts`. By convention, the main source of the
  application is `src/flags/sources/self`. Use `src/flags`, since SvelteKit
  type-checks `src` only.
- With `@vercel/flags-core` in the dependencies, the source `self` is the
  default source of Vercel Flags, also without `src/flags/sources/self`:
  `new VercelProvider()` and the catalog of `@vercel/flags-core/catalog`.
  Each file in `src/flags/sources/self` replaces its part, e.g.
  `context.ts` adds an evaluation context. Without the credentials of
  `vercel env pull`, `flags:self` has no flags and the SDK warns. To turn
  the default source off, set `"selfSource": false` in
  `src/flags/config.json`.
- The plugin generates `.flags/<source>.ts` one time for `vite build`, and
  watches the catalogs in `vite dev`. It adds the aliases
  `flags:<source>`:

  ```ts
  import { summerSale } from 'flags:self';
  ```

- The types are in `src/flags/generated.d.ts`, so `svelte.config.js` and
  `tsconfig.json` need no change. `.flags` has its own `.gitignore`.
- Without `flags/sources` and without the default source, the plugin
  writes nothing. To turn the generation
  off, use `flags({ disableCodeGeneration: true })`.
- Without code generation, write `defineSource` and `source.bindFlag` by hand.
  Each flag is declared on its source. The runtime has no global source.

## How it works

- `flags()` points `flags/framework` to `@flags-sdk/sveltekit/binding`, and
  `flags/hooks`, `flags/overrides` and `flags/settings` to
  `flags/hooks.ts`, `flags/overrides.ts` and `flags/config.json`, if they
  exist. It bundles `flags` and
  `@flags-sdk/sveltekit` into the server code (`ssr.noExternal`), because
  an alias only reaches the SDK when the bundler processes it.
- The binding gets the request with `getRequestEvent()`. The headers of the
  request identify it, so the SDK creates the evaluation context and
  evaluates each flag one time for each request.
- The binding uses `isRedirect()` and `isHttpError()` of `@sveltejs/kit`.
  The plugin deduplicates `@sveltejs/kit`, so that the binding and your
  code use one copy.
- In `vite dev`, the configuration files are loaded again before each
  evaluation.

## Gotchas

- **Use a default export.** `flags/hooks.ts` and `flags/overrides.ts` must
  export their value as the default export.
- **Prerendered pages have no request.** Their flags use the evaluation
  context without a request.

## License

MIT
