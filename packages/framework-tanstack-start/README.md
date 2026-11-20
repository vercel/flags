# @flags-sdk/tanstack-start

The TanStack Start package of the [Flags SDK](../flags). It connects the SDK
to TanStack Start: the current request, `flags/config.ts`, the signals of
TanStack Router, discovery for Flags Explorer, and code generation.

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
- **Discovery** in `vite dev` and in the build.
- **Code generation.** Import the flags of a source from `flags:<source>`,
  e.g. `flags:self`.

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

## Code generation

The plugin generates the code by default:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [nitro(), tanstackStart(), viteReact(), flags()],
});
```

- Each source is a directory `flags/sources/<source>` with `catalog.ts`,
  `provider.ts` and an optional `context.ts`. By convention, the main source of the
  application is `flags/sources/self`.
- The plugin generates `.flags/<source>.ts` one time for `vite build`, and
  watches the catalogs in `vite dev`. It adds the aliases
  `flags:<source>`:

  ```ts
  import { 'summer-sale' as summerSale } from 'flags:self';
  ```

- The types are in `flags/generated.d.ts`, so `tsconfig.json` needs no
  change. `.flags` has its own `.gitignore`.
- Without `flags/sources`, the plugin writes nothing. To turn the generation
  off, use `flags({ disableCodeGeneration: true })`.
- Without code generation, write `defineSource` and `bindFlag` by hand.
  Each flag names its source. There is no default source.

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
