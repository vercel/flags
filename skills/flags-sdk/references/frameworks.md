# Frameworks

The flags and the call sites are the same in every framework. A framework package only gives the SDK the current request, loads the configuration files (`flags/hooks.ts`, `flags/config.json`), lets framework signals through, registers `'use flags'` modules, generates `flags:<source>`, and serves the manifest in development.

The source folder is the same in every framework with a bundler (see [code-generation.md](code-generation.md)). With `@vercel/flags-core` in `package.json`, the source `self` is the default source of Vercel Flags: no folder is needed. Add only the file of the part that you replace, e.g. the context:

```ts
// flags/sources/self/context.ts (optional; SvelteKit: src/flags/sources/self/context.ts)
import type { FlagsRequest } from 'flags';

export default function getEvaluationContext(
  request: FlagsRequest | undefined,
) {
  return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
}
```

With another provider, or without `@vercel/flags-core`, the folder needs both files:

```ts
// flags/sources/self/provider.ts
import { VercelProvider } from '@vercel/flags-core/openfeature';

export default new VercelProvider();
```

```ts
// flags/sources/self/catalog.ts
export { default } from '@vercel/flags-core/catalog';
```

Without `flags/sources`, the types of the default source go to `src/flags/generated.d.ts` if the app has `src/`, else `flags/generated.d.ts`. To turn the default source off, e.g. when the sources are written by hand, set `"selfSource": false` in `flags/config.json`. Each plugin and the CLI read this file. There is no plugin option for it.

To try the SDK without an account, export `new TypedInMemoryProvider({...})` of `@openfeature/server-sdk` from `provider.ts`, and return a static catalog (see [code-generation.md](code-generation.md#static-catalog)).

## Table of contents

- [Next.js](#nextjs)
- [SvelteKit](#sveltekit)
- [Nuxt](#nuxt)
- [TanStack Start](#tanstack-start)
- [Hono](#hono)
- [Express](#express)
- [No framework (plain Node.js)](#no-framework-plain-nodejs)
- [Custom frameworks](#custom-frameworks)

## Next.js

Next.js 15.4 or newer, App Router, Turbopack. Node.js 20.19, or 22.12 or newer.

```sh
pnpm add flags @flags-sdk/next @vercel/flags-core @openfeature/server-sdk
```

```ts
// next.config.ts
import { withFlags } from '@flags-sdk/next/plugin';

export default withFlags({
  // Your Next.js configuration, as usual
});
```

- `withFlags` returns a phase function. It must be the outer plugin: `withFlags(withVercelToolbar()(nextConfig))`.
- A phase function config: `withFlags((phase) => ({ ... }))`.
- The folder `flags` outside the app directory or its `src`: `withFlags({}, { dir: '/path/to/the/app' })`.
- No default source `self`: `"selfSource": false` in `flags/config.json`.
- Without code generation: `withFlags({}, { disableCodeGeneration: true })`. It returns the object, and still reads `.flags/aliases.json`, e.g. after `flags sync` or with `flags watch -- next dev`.

Use a flag in a server component or a route handler:

```tsx
// app/page.tsx
import { enableSale } from 'flags:self';
import { betaBanner } from '../flags';

export default async function Page() {
  const sale = await enableSale();
  const beta = await betaBanner();
  return (
    <main>
      {beta ? <p>You see the beta.</p> : null}
      {sale ? <h1>Summer sale!</h1> : <h1>Welcome</h1>}
    </main>
  );
}
```

The proxy (`proxy.ts`, formerly middleware) does not use `headers()`, so wrap the call:

```ts
// proxy.ts
import { runtime } from 'flags/runtime';
import { type NextRequest, NextResponse } from 'next/server';
import { betaBanner } from './flags';

export async function proxy(request: NextRequest) {
  const beta = await runtime.onInvoke(request, () => betaBanner());
  if (beta) {
    return NextResponse.rewrite(new URL('/beta', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: '/' };
```

Flags Explorer needs one route file:

```ts
// app/.well-known/flags/manifest.json/route.ts
export { GET } from '@flags-sdk/next/manifest';
```

In development, it returns the manifest with `cache-control: no-store`. In production, it returns 404 by design, and `next build` writes `flags-manifest.json` into `distDir` (`.next`).

Vercel Toolbar for local development:

```ts
// next.config.ts
import { withFlags } from '@flags-sdk/next/plugin';
import { withVercelToolbar } from '@vercel/toolbar/plugins/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

// withFlags must be the outer plugin
export default withFlags(withVercelToolbar()(nextConfig));
```

```tsx
// app/layout.tsx
import { VercelToolbar } from '@vercel/toolbar/next';

// inside <body>:
{process.env.NODE_ENV === 'development' && <VercelToolbar />}
```

Flag values in the page, for Flags Explorer and Web Analytics:

```tsx
// app/layout.tsx
import { FlagValues } from '@flags-sdk/next/flag-values';
import { checkout, summerSale } from '../flags';

// inside <body>:
<FlagValues flags={[summerSale, checkout]} />
```

### Cache Components

- No `await connection()`: the SDK waits for it itself.
- A component that evaluates a flag is dynamic. Render it inside `<Suspense>`.
- A flag inside `'use cache'` throws `FlagInCacheError`, also with a `defaultValue`. Evaluate outside and pass the value in:

```tsx
import { Suspense } from 'react';
import { enableSale } from 'flags:self';

async function Prices({ sale }: { sale: boolean }) {
  'use cache';
  return <PriceList sale={sale} />;
}

async function Sale() {
  return <Prices sale={await enableSale()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Sale />
    </Suspense>
  );
}
```

### Signals and static rendering

- `redirect()`, `notFound()` and "Dynamic server usage" pass through, also from `getEvaluationContext`.
- A page with a flag is dynamic. For a static page with flags, use [precompute](precompute.md).
- Flags in `generateStaticParams` or `force-static` pages get `undefined` as the request.
- Server components have no URL: `request.url` is `undefined`. Pass URL values with `evaluationContext`.

### Provider events

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }
  const { runtime } = await import('flags');
  runtime.addHandler('PROVIDER_CONFIGURATION_CHANGED', (details) => {
    console.log(`${details.providerName} changed`);
  });
}
```

### Limits

- Turbopack only. Webpack builds throw.
- App Router. The Pages Router and server actions are not tested.
- The Edge runtime is not tested, and is deprecated by Next.js.
- No `onInit` or `onShutdown`: providers initialize on their first evaluation.
- Do not import `flags` in a `'use client'` file. The SDK uses `node:async_hooks`.

## SvelteKit

SvelteKit 2.20 or newer, Vite 6 or newer.

```sh
pnpm add flags @flags-sdk/sveltekit @vercel/flags-core @openfeature/server-sdk
```

```ts
// vite.config.ts
import { flags } from '@flags-sdk/sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit(), flags()],
});
```

- Put the source folder (or only `context.ts` for the default source) into `src/flags/sources/self/`, since SvelteKit type-checks `src` only. The types go into `src/flags/generated.d.ts`. The configuration files go into `src/flags/` too, e.g. `src/flags/hooks.ts` and `src/flags/config.json`.
- No `handle` hook is needed. The binding reads the request with `getRequestEvent()`.
- Flags work in `load` of `+page.server.ts` and `+layout.server.ts`, form actions, `+server.ts`, and `hooks.server.ts`. Do not import `flags` in universal `+page.ts` files or components.
- `redirect()` and `error()` pass through, also from `getEvaluationContext`.
- No default source `self`: `"selfSource": false` in `src/flags/config.json`.
- Without code generation: `flags({ disableCodeGeneration: true })`.

```ts
// src/routes/+page.server.ts
import { enableSale } from 'flags:self';
import { betaBanner } from '$lib/flags';

export async function load() {
  const sale = await enableSale();
  const beta = await betaBanner();
  return { sale, beta };
}
```

Initialize providers at startup (optional):

```ts
// src/hooks.server.ts
import type { ServerInit } from '@sveltejs/kit';
import { runtime } from 'flags/runtime';

export const init: ServerInit = async () => {
  await runtime.onInit();
};
```

Manifest: `vite dev` serves `/.well-known/flags/manifest.json`. `vite build` writes `flags-manifest.json` into `.svelte-kit/output/server` (`adapter-node` copies it to `build/server`). Flag values in the page: write the element yourself with `encryptFlagValues` and `serializeFlagValues` ([api.md](api.md#flag-values)). Prerendered pages have no request. No precompute.

## Nuxt

Nuxt 4 with Nitro 2.

```sh
pnpm add flags @flags-sdk/nuxt @vercel/flags-core @openfeature/server-sdk
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@flags-sdk/nuxt'],
});
```

- The module enables the async context of Nitro, and adds `flags/generated.d.ts` to the Nuxt types.
- It starts the providers with the Nitro server and closes them at shutdown. Do not call `runtime.onInit()` or `runtime.onShutdown()`.
- Flags run only on the Nitro server. Evaluate them in server routes, and load the values with `useFetch`. Do not import `flags` or `flags:self` in components or composables.
- `createError()` passes through, also from `getEvaluationContext`.
- No default source `self`: `"selfSource": false` in `flags/config.json`.
- Without code generation: `modules: [['@flags-sdk/nuxt', { disableCodeGeneration: true }]]`.

```ts
// server/api/flags.get.ts
import { enableSale } from 'flags:self';
import { betaBanner } from '../../lib/flags';

export default defineEventHandler(async () => {
  const sale = await enableSale();
  const beta = await betaBanner();
  return { sale, beta };
});
```

```vue
<!-- app/pages/index.vue -->
<script setup lang="ts">
const { data } = await useFetch('/api/flags');
</script>

<template>
  <h1>{{ data?.sale ? 'Summer sale!' : 'Welcome' }}</h1>
</template>
```

Manifest: `nuxt dev` serves `/.well-known/flags/manifest.json`. `nuxt build` writes `flags-manifest.json` into `.output/server`. No precompute.

## TanStack Start

TanStack Start 1 with Vite 6 or newer, React or Solid.

```sh
pnpm add flags @flags-sdk/tanstack-start @vercel/flags-core @openfeature/server-sdk
```

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

- No middleware is needed. The binding reads the request with `getRequest()`.
- Route loaders also run in the browser, so call flags in a server function. Server routes can call flags directly.
- `redirect()` and `notFound()` pass through, also from `getEvaluationContext`.
- No default source `self`: `"selfSource": false` in `flags/config.json`. Without `flags/sources`, its types go into `src/flags/generated.d.ts`.
- Without code generation: `flags({ disableCodeGeneration: true })`.

```tsx
// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { enableSale } from 'flags:self';

// Flags run on the server, so the loader calls a server function
const getSale = createServerFn({ method: 'GET' }).handler(() => enableSale());

export const Route = createFileRoute('/')({
  loader: () => getSale(),
  component: Home,
});

function Home() {
  const sale = Route.useLoaderData();
  return sale ? <p>Summer sale!</p> : null;
}
```

```ts
// src/routes/api/flags.ts
import { createFileRoute } from '@tanstack/react-router';
import { enableSale } from 'flags:self';
import { betaBanner } from '../../flags';

export const Route = createFileRoute('/api/flags')({
  server: {
    handlers: {
      GET: async () => {
        const sale = await enableSale();
        const beta = await betaBanner();
        return Response.json({ sale, beta });
      },
    },
  },
});
```

Manifest: `vite dev` serves `/.well-known/flags/manifest.json`. `vite build` writes `flags-manifest.json` into `.output/server`. No precompute.

## Hono

Hono 4 or newer. There is no bundler, so write the source by hand (or use `flags sync` and import `./.flags/self.ts` by its path).

```sh
pnpm add flags @flags-sdk/hono @vercel/flags-core @openfeature/server-sdk
```

```ts
// src/flags/self.ts
import { VercelProvider } from '@vercel/flags-core/openfeature';
import { defineSource } from 'flags';

export const self = defineSource({
  provider: new VercelProvider(),
  project: { system: 'vercel-flags' },
  // Runs one time for each request
  getEvaluationContext: (request) => ({
    user: request?.cookies?.get('user')?.value ?? 'anonymous',
  }),
});
```

```ts
// src/flags.ts
'use flags';

import { defineFlag } from 'flags';
import { self } from './flags/self.ts';

// A flag of the source: the provider decides the value
export const enableSale = self.bindFlag('enableSale', {
  defaultValue: false,
  description: 'Shows the summer sale',
});

// An inline flag: your code decides the value
export const betaBanner = defineFlag({
  key: 'betaBanner',
  decide: (request) => request?.cookies?.get('beta')?.value === '1',
  options: [false, true] as const,
  description: 'Shows the beta banner to testers',
});
```

```ts
// src/server.ts
import { flags } from '@flags-sdk/hono';
import { serve } from '@hono/node-server';
import { runtime } from 'flags/runtime';
import { Hono } from 'hono';
import { betaBanner, enableSale } from './flags.ts';

const app = new Hono();

// Each request runs in runtime.onInvoke
app.use(flags());

app.get('/', async (c) => {
  const sale = await enableSale();
  const beta = await betaBanner();
  return c.json({ sale, beta });
});

await runtime.onInit();
const server = serve({ fetch: app.fetch, port: 3000 });

process.on('SIGTERM', () => {
  server.close();
  void runtime.onShutdown();
});
```

- The configuration files are not loaded for you: `import hooks from './flags/hooks'`, then `app.use(flags({ config: { hooks } }))`. `flags sync` and `flags watch` read `flags/config.json`.
- `HTTPException` passes through, also from `getEvaluationContext`.
- Without the middleware: `app.use((c, next) => runtime.onInvoke(c.req.raw, next))`.
- Manifest: run `npx flags manifest` (on the source with Node.js 22.18 or newer, or on the `tsc` output). A bundled output loses the directive.
- Node.js 22.18 or newer runs the TypeScript source directly: `node src/server.ts`.

## Express

Express 4 or newer. Write the source and the flags by hand, as for Hono.

```sh
pnpm add flags @flags-sdk/express @vercel/flags-core @openfeature/server-sdk
```

```ts
// src/server.ts
import { flags } from '@flags-sdk/express';
import express from 'express';
import { runtime } from 'flags/runtime';
import { betaBanner, enableSale } from './flags.ts';

const app = express();

// Each request runs in runtime.onInvoke
app.use(flags());

app.get('/', async (_request, response) => {
  const sale = await enableSale();
  const beta = await betaBanner();
  response.json({ sale, beta });
});

await runtime.onInit();
const server = app.listen(3000);

process.on('SIGTERM', () => {
  server.close();
  void runtime.onShutdown();
});
```

- The middleware converts the Node.js headers to Web `Headers`, and builds the URL from `Host` and `originalUrl`.
- The configuration files: `import hooks from './flags/hooks'`, then `app.use(flags({ config: { hooks } }))`, as for Hono.
- Manifest: `npx flags manifest`, as for Hono.

## No framework (plain Node.js)

Install only `flags` (and your provider). Call the runtime yourself:

| Function                          | When                   | What it does                                                         |
| --------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `runtime.onInit()`                | Once at startup        | Initializes the providers of all registered sources. Logs errors.    |
| `runtime.onInvoke(request, next)` | For each request       | Runs `next` in the scope of the request. Returns its result.         |
| `runtime.onShutdown()`            | When the process stops | Closes the providers.                                                |
| `runtime.configure(config)`       | At startup             | Sets the configuration, e.g. `{ hooks, settings }` of `flags/hooks.ts` and `flags/config.json`. |

```ts
// A fetch handler: a Web Request fits as it is
export default {
  fetch: (request: Request) =>
    runtime.onInvoke(request, async () => {
      return Response.json({ sale: await enableSale() });
    }),
};
```

- With `node:http`, pass `{ headers, url }`, and pass the same `headers` object for the whole request. Without `cookies`, the SDK reads the `Cookie` header.
- Scripts and cron jobs have no request. Pass what the flag needs with `evaluationContext`.
- `'use flags'` is optional here. Add it if you want to write a manifest with `npx flags manifest`.
- Without a bundler, nothing appends the self-registration of `'use flags'` modules. `source.bindFlag` registers its source itself. Call `registerFlags` of `flags/runtime` for modules that export plain flag objects.
- Complete example: `examples/standard/plain` in the repository.

## Custom frameworks

A framework with a middleware that wraps each handler needs no binding: `app.use((request, next) => runtime.onInvoke(request, next))`.

Write a binding when the framework gives the request at any time (like `headers()` or `getRequestEvent()`), uses thrown errors as signals, or should load the configuration files and the manifest without app code:

```ts
// binding.ts: the module behind the alias flags/framework
import type { SetupFramework } from 'flags/runtime';

export const setupFramework: SetupFramework = (runtime) => {
  runtime.setGetRequest(getRequest);
  runtime.setRethrow(rethrowSignal);
  runtime.setLoadConfig(async () => {
    // Import the files in the binding, which the bundler builds, so that
    // the aliases of the plugin apply
    const { configFromModules } = await import('flags/config');
    return configFromModules(
      await Promise.all([import('flags/hooks'), import('flags/settings')]),
    );
  });
};
```

- The build plugin aliases `flags/hooks` and `flags/settings` to `flags/hooks.ts` and `flags/config.json`, only for the files that exist. Find them with `findConfigModules(dir)` of `flags/tooling`. The binding imports the two modules itself, and builds the configuration with `configFromModules` of `flags/config`.

- The binding imports only types from `flags`.
- `setGetRequest` returns `FlagsRequestInit` or `undefined`, with the same `headers` object for one request.
- Bundle `flags` into the server code, so the aliases reach it. Without an alias, call `registerFramework(setupFramework)` of `flags/tooling` at startup.
- For a Vite framework, use `flags({ binding, bundle, dedupe })` of `@flags-sdk/vite`.
- Check the binding with the conformance suite `@flags-sdk/conformance`. The bindings in `packages/framework-*` are the reference implementations.

Docs: https://flags-sdk.dev/docs/frameworks/custom-frameworks
