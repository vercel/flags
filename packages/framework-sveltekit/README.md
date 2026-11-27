# `@flags-sdk/sveltekit`

The SvelteKit integration of the [Flags SDK](https://flags-sdk.dev) v5. It gives `flags` the current request of SvelteKit.

## Setup

```sh
npm install flags @flags-sdk/sveltekit
```

Add the plugin `flags()` after `sveltekit()`:

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { flags } from '@flags-sdk/sveltekit/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [sveltekit(), flags()] });
```

`flags()` points the alias `flags/framework` to the binding of SvelteKit, which reads the request with `getRequestEvent()` of `$app/server` (SvelteKit 2.20 or later). Then a flag gets the request in `load` functions, actions, endpoints and hooks:

```ts
// src/lib/flags.ts
import { flag } from 'flags';

export const showBanner = flag<boolean>({
  key: 'show-banner',
  decide: ({ cookies }) => cookies.get('beta')?.value === '1',
});
```

```ts
// src/routes/+page.server.ts
import { showBanner } from '$lib/flags';

export async function load() {
  return { banner: await showBanner() };
}
```

In `reroute` and outside of a request, pass the request, e.g. `precompute(flags, request)`.

## The manifest of the flags

Put `'use flags'` at the start of each module which exports only flags (see the README of `flags`). `flags()` then makes the manifest of the flags, with no more code:

- In `vite dev`, the manifest is at `/.well-known/flags/manifest.json`.
- `vite build` writes it into `.svelte-kit/output/server/flags-manifest.json`. In production, there is no public endpoint.

## The handle hook

`createHandle` is optional. It gives the request of the hook to the runtime of the SDK (`runtime.onInvoke`), so that a flag does not need `getRequestEvent()`. It puts the values of the flags which a page evaluated into the page, for the Vercel Toolbar, and, with `flags`, serves `/.well-known/vercel/flags` for Flags Explorer:

```ts
// src/hooks.server.ts
import { createHandle } from '@flags-sdk/sveltekit';
import * as flags from '$lib/flags';

export const handle = createHandle({ flags });
```

`createFlagsDiscoveryEndpoint` creates the endpoint as a route instead.
