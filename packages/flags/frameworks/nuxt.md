# Flags SDK with Nuxt

Status: the runtime works with `runtime.onInvoke` in server routes. The
module `flags/nuxt` registers `'use flags'` modules and writes the manifest
of the flags. A full framework binding (request source, `flags.config.ts`) is
planned (milestone 13). `tests/standard/nuxt` tests it with Nuxt 4.6 and
Nitro 2.

## Setup

```ts
// nuxt.config.ts
export default defineNuxtConfig({ modules: ['flags/nuxt'] });
```

```ts
// server/api/flags.get.ts
import { evaluate, runtime } from 'flags';
import { bannerText, summerSale } from '../../lib/flags';

export default defineEventHandler((event) =>
  runtime.onInvoke(toWebRequest(event), () =>
    evaluate([summerSale, bannerText]),
  ),
);
```

## Discovery

- Nuxt builds the app with Vite and the server with Nitro. The module adds
  the plugin of `flags/vite` to both, so `'use flags'` modules register
  their flags in pages and in server routes.
- `nuxt dev` serves the manifest at `/.well-known/flags/manifest.json`, with
  `no-store`.
- `nuxt build` writes `flags-manifest.json` into `.output/server` (the
  build of Nitro).

## Notes

- The module is a plain function which uses the hooks `vite:extendConfig`
  and `nitro:config`, so the SDK does not depend on `@nuxt/kit`.
