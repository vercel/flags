# Flags SDK with TanStack Start

Status: the framework binding `flags/tanstack-start` gives the SDK the
request and `flags.config.ts`. The plugin of `flags/vite` registers
`'use flags'` modules and writes the manifest of the flags.
`tests/standard/tanstack-start` tests it with TanStack Start 1.168 (React)
and Nitro 3, in the build and in `vite dev`.

## Setup

```ts
// vite.config.ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { flags } from 'flags/vite';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    nitro(),
    tanstackStart(),
    viteReact(),
    flags({ framework: 'tanstack-start' }),
  ],
});
```

That is the only required step. The application needs no middleware.

## Optional: `flags.config.ts`

Put it in the directory of the project or in `src`, as for the other
frameworks.

## Usage

Flags run only on the server. A loader calls a server function:

```tsx
// src/routes/index.tsx
const getFlags = createServerFn({ method: 'GET' }).handler(async () => {
  const [checkout, banner] = await evaluate([newCheckout, bannerText]);
  return { checkout, banner };
});

export const Route = createFileRoute('/')({
  loader: () => getFlags(),
  component: Home,
});
```

- Server routes can evaluate flags directly in their handlers.
- `redirect()` and `notFound()` of TanStack Router pass through the SDK,
  also from `getEvaluationContext`.

## Discovery

- `vite dev` serves the manifest at `/.well-known/flags/manifest.json`. The
  SSR environment of Vite runs in a worker of Nitro, so the plugin imports
  the flags modules in a runnable copy of that environment.
- `vite build` writes `flags-manifest.json` into `.output/server`.

## Deployment

The same as for SvelteKit (see `sveltekit.md`): on Vercel, the plugin uses
`@vercel/flags-core/default-provider` if the project has it, and
`defaultProvider` gives an other module.

## How it works

- The binding gets the request with `getRequest()` of TanStack Start. The
  SDK does not depend on TanStack Start, so it imports
  `flags:tanstack-start/server`. The plugin resolves this module to
  `@tanstack/react-start/server` or `@tanstack/solid-start/server` of the
  project.
- The plugin bundles `flags` into the server code, so that the aliases
  reach it, and excludes it from the optimizer of dependencies of Vite,
  which must not bundle the server module of TanStack Start in advance.
