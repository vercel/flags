# Flags SDK with SvelteKit

Status: the runtime works with `runtime.onInvoke` in `hooks.server.ts`. The
Vite plugin of `flags/vite` registers `'use flags'` modules and writes the
manifest of the flags. A full framework binding (request source, `flags.config.ts`)
is planned (milestone 13). `tests/standard/sveltekit` tests it with
SvelteKit 2.70 and Vite 8.

## Setup

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { flags } from 'flags/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [sveltekit(), flags()] });
```

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { runtime } from 'flags';

export const handle: Handle = ({ event, resolve }) =>
  runtime.onInvoke(event.request, () => resolve(event));
```

## Discovery

- Modules which start with `'use flags'` register their flags (see
  `../SPEC.md`, section "Discovery").
- `vite dev` serves the manifest at `/.well-known/flags/manifest.json`, with
  `no-store`.
- `vite build` writes `flags-manifest.json` into the server output
  (`.svelte-kit/output/server`). `adapter-node` copies it into
  `build/server`.

## Notes

- The plugin works with the environment API of Vite (`consumer: 'server'`),
  and with the `ssr` flag of older versions.
- The repository pins `@sveltejs/kit` to 2.70 with an override, so the test
  app uses SvelteKit 2, not 3.
