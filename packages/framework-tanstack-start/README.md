# @flags-sdk/tanstack-start

The TanStack Start package of the [Flags SDK](../flags). It connects the SDK
to TanStack Start: the current request, the configuration files, the signals of
TanStack Router, discovery for Flags Explorer, and flags files.

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
- **Flags files.** Declare the flags in `app.flags`, and import them from
  the file or from their source, e.g. `flags:self`.

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

### 2️⃣ Optional: the configuration files

You do not need a configuration file: each flag is declared on its source, and
overrides work with `FLAGS_SECRET`, or on Vercel, without one. The folder `flags` (or `src/flags`),
next to `flags/sources`, can have one file for each part of the
configuration of all flags. None of them has a source:

- `flags/hooks.ts`: the OpenFeature hooks for all flags, as the default
  export.
- `flags/config.json`: the static settings, e.g. `"selfSource": false`, or
  `overrides`: which override cookies the SDK accepts.

The Vite plugin loads them automatically. In development, a change applies without a restart.

```ts
// flags/hooks.ts
import type { Hook } from 'flags';

const hooks: Hook[] = [myLoggingHook];

export default hooks;
```

See [Configuration](https://flags-sdk.dev/docs/flags/configuration).

## Usage

Flags run only on the server. A loader calls a server function:

```tsx
// src/routes/index.tsx
const getFlags = createServerFn({ method: 'GET' }).handler(async () => {
  const checkout = await newCheckout();
  const banner = await bannerText();
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

## Flags files and code generation

The plugin compiles each flags file (`*.flags`), and runs the code
generation by default:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [nitro(), tanstackStart(), viteReact(), flags()],
});
```

```js
// app.flags
flag summerSale {
  defaultValue: false
}
```

- A flags file declares the flags: name, key, type, options, description
  and default value. Your flag management system still decides the values.
  The build uses no network and no credentials.
- The source of a flags file is the directory `flags/sources/<source>`
  with `provider.ts`, and an optional `context.ts` and `hooks.ts`. By
  convention, the main source of the application is `self`.
- With `@vercel/flags-core` in the dependencies, the source `self` needs no
  `provider.ts`: it uses `new VercelProvider()`. Each file in
  `flags/sources/self` replaces or adds its part, e.g. `context.ts`
  adds an evaluation context. To turn the default provider off, set
  `"selfSource": false` in `flags/config.json`.
- The plugin writes `.flags/<source>.ts` one time for `vite build`, and
  again after each change of a flags file in `vite dev`. Each module
  re-exports the flags of its source from all flags files. It adds the
  aliases `flags:<source>`:

  ```ts
  import { summerSale } from 'flags:self';
  // or from the file: import { summerSale } from '../app.flags';
  ```

- Without a flags file of a source, there is no `flags:<source>`. An empty
  `app.flags` gives `flags:self`. A new source needs a restart of the
  dev server.
- The types are in `flags/generated.d.ts` (in the folder `flags` which
  exists, else in `src/flags` if the application has `src`), so
  `tsconfig.json` needs no `paths`, and in a declaration file next to each
  flags file, e.g. `app.d.flags.ts` (turn on `allowArbitraryExtensions`,
  and ignore `*.d.flags.ts` in Git). `.flags` has its own `.gitignore`.
- Without flags files, the plugin writes nothing. To turn the generation
  off, use `flags({ disableCodeGeneration: true })`. The flags files still compile.
- Without flags files, write `defineSource` and `source.bindFlag` by hand.
  Each flag is declared on its source. The runtime has no global source.

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
