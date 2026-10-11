# Flags SDK with SvelteKit

Status: the framework binding `flags/sveltekit` gives the SDK the request
and `flags.config.ts`. The Vite plugin registers `'use flags'` modules and
writes the manifest of the flags. `tests/standard/sveltekit` tests it with
SvelteKit 2.70 and Vite 8, in the build and in `vite dev`.

## Requirements

- SvelteKit 2.20 or newer, for `getRequestEvent()`.
- Vite 6 or newer.

## Setup

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { flags } from 'flags/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit(), flags({ framework: 'sveltekit' })],
});
```

That is the only required step. The application needs no `handle` hook.

## Optional: `flags.config.ts`

Put it in the directory of the project or in `src`:

```ts
// src/flags.config.ts
import { defineConfig, defineConnection } from 'flags';

export const config = defineConfig({
  defaultConnection: defineConnection({
    provider: myProvider,
    project: { system: 'in-memory' },
    getEvaluationContext: (_context, request) => ({
      user: request?.cookies?.get('user')?.value ?? 'anonymous',
    }),
  }),
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

- Flags run only on the server: in `load` of `+page.server.ts`, in actions,
  in `+server.ts`, and in hooks.
- `redirect()` and `error()` of SvelteKit pass through the SDK, also from
  `getEvaluationContext`.
- To initialize the providers before the first request, call
  `runtime.onInit()` in `init` of `hooks.server.ts`.

## Discovery

- Modules which start with `'use flags'` register their flags (see
  `../SPEC.md`, section "Discovery").
- `vite dev` serves the manifest at `/.well-known/flags/manifest.json`, with
  `no-store`.
- `vite build` writes `flags-manifest.json` into the server output
  (`.svelte-kit/output/server`). `adapter-node` copies it into
  `build/server`.

## How it works

- `flags({ framework: 'sveltekit' })` points `flags/framework` to
  `flags/sveltekit` and `flags/config` to `flags.config.ts`. It bundles
  `flags` into the server code (`ssr.noExternal`), because an alias only
  reaches the SDK when the bundler processes it.
- The binding gets the request with `getRequestEvent()`. The headers of the
  request identify it, so the SDK creates the evaluation context and
  evaluates each flag one time for each request.
- In `vite dev`, `flags.config.ts` is loaded again before each evaluation.

## Deployment

- On Vercel, a build sets `VERCEL`. If the project has `@vercel/flags-core`,
  the plugin then replaces `flags/default-provider` with
  `@vercel/flags-core/default-provider`. Flags without a connection then
  use the fast provider of Vercel Flags, without a request for each
  evaluation. Development uses OFREP.
- A `defaultConnection` in `flags.config.ts` always wins over the default
  provider.
- An other platform, or a test, gives the module of its provider:
  `flags({ framework: 'sveltekit', defaultProvider: './src/provider.ts' })`.
  The module exports `createDefaultProvider()`.
- The adapter of SvelteKit runs after the build of Vite, so it is too late
  for an alias. Thus, the plugin sets it.

## Notes

- The repository pins `@sveltejs/kit` to 2.70 with an override, so the test
  app uses SvelteKit 2, not 3.
- `tests/standard/sveltekit` has a platform variant (`build-platform`),
  which gives the plugin a test provider.
