# @flags-sdk/tanstack-start

The TanStack Start package of the [Flags SDK](../flags). It connects the SDK
to TanStack Start: the current request, `flags.config.ts`, the signals of
TanStack Router, discovery for Flags Explorer, and the default provider of
the platform.

```ts
// vite.config.ts
export default defineConfig({
  plugins: [nitro(), tanstackStart(), viteReact(), flags()],
});
```

## Features

- **One line of setup.** `flags()` in `vite.config.ts`. No middleware.
- **The request** with `getRequest()`: in server functions, server routes
  and the rendering of pages.
- **Signals pass through.** `redirect()` and `notFound()` reach TanStack
  Start unchanged, also from `getEvaluationContext`.
- **React and Solid.** The binding uses the packages of your project.
- **Discovery** in `vite dev` and in the build, and the **default provider**
  of Vercel for builds on Vercel.

## Installation

```sh
pnpm add flags @flags-sdk/tanstack-start
```

TanStack Start 1 with Vite 6 or newer. Your code imports only `flags`.
`@flags-sdk/tanstack-start` is only for the setup.

## Setup

### 1️⃣ Add the plugin

```ts
// vite.config.ts
import { flags } from '@flags-sdk/tanstack-start/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [nitro(), tanstackStart(), viteReact(), flags()],
});
```

That is the only required step.

### 2️⃣ Optional: `flags.config.ts`

Without `flags.config.ts`, flags use Vercel Flags with zero configuration:
locally through OFREP with the OIDC token of `vercel env pull`, and in a
build on Vercel with the fast provider of `@vercel/flags-core`, if the
project has it. Write `flags.config.ts` for an evaluation context, or for
fast evaluations also in development:

```sh
pnpm add @vercel/flags-core @openfeature/server-sdk
```

Put it in the directory of the project or in `src`:

```ts
// src/flags.config.ts
import { VercelProvider } from '@vercel/flags-core/openfeature';
import { defineConfig, defineConnection } from 'flags';

export const config = defineConfig({
  defaultConnection: defineConnection({
    provider: new VercelProvider(),
    project: { system: 'vercel-flags' },
    getEvaluationContext: (_context, request) => ({
      user: request?.cookies?.get('user')?.value ?? 'anonymous',
    }),
  }),
});

// Gives flags without a connection the types of this connection
declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
```

Any other OpenFeature provider works in the same way.

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

Server routes can evaluate flags directly in their handlers. See the
[Flags SDK](../flags) for flags, the evaluation context, overrides, hooks
and tracking.

## Discovery

- `vite dev` serves the manifest at `/.well-known/flags/manifest.json`. The
  SSR environment of Vite runs in a worker of Nitro, so the plugin imports
  the flags modules in a runnable copy of that environment.
- `vite build` writes `flags-manifest.json` into `.output/server`.

## Deployment

On Vercel, the plugin uses `@vercel/flags-core/default-provider` if the
project has it. `flags({ defaultProvider: './src/provider.ts' })` gives an
other module. A `defaultConnection` in `flags.config.ts` always wins.

## How it works

- The binding gets the request with `getRequest()` of TanStack Start, and
  recognizes `redirect()` and `notFound()` with `isRedirect()` and
  `isNotFound()` of TanStack Router.
- TanStack Start has a package for React and one for Solid. Thus, the
  binding imports `flags:tanstack-start/server` and
  `flags:tanstack-start/router`, and the plugin resolves them to the
  packages of your project.
- The plugin bundles `flags` and `@flags-sdk/tanstack-start` into the server
  code, so that the aliases reach them, and excludes them from the
  optimizer of dependencies of Vite, which must not bundle the server
  module of TanStack Start in advance.

## License

MIT
