# @flags-sdk/next

The Next.js package of the [Flags SDK](../flags). It connects the SDK to
Next.js: the request of each page, `flags.config.ts`, the signals of
Next.js, discovery for Flags Explorer, and precompute.

```ts
// next.config.ts
import { withFlags } from '@flags-sdk/next/plugin';

export default withFlags({});
```

## Features

- **One line of setup.** `withFlags` in `next.config.ts`. No middleware, and
  no code in your pages.
- **Server components, route handlers and the proxy.** Each page gets the
  request of Next.js through `headers()` and `cookies()`.
- **Signals pass through.** "Dynamic server usage", `notFound()` and
  `redirect()` reach Next.js unchanged.
- **Precompute.** Static pages for each combination of flags, with the API
  and the code format of v4.
- **Discovery.** A manifest of your flags for Flags Explorer, in
  development and in the build.

## Installation

```sh
pnpm add flags @flags-sdk/next
```

Next.js 15.4 or newer, with the App Router and Turbopack. Node.js 20.19,
or 22.12 or newer. Your code imports only `flags`. `@flags-sdk/next` is for
the setup and for precompute.

For fast evaluations of Vercel Flags, also on your own computer, install
the OpenFeature provider of Vercel Flags:

```sh
pnpm add @vercel/flags-core @openfeature/server-sdk
```

## Setup

### 1️⃣ Add the plugin

```ts
// next.config.ts
import { withFlags } from '@flags-sdk/next/plugin';

export default withFlags({
  // The configuration of Next.js, as usual
});
```

That is the only required step. `withFlags` keeps your configuration, also
your aliases and rules of Turbopack. If `flags.config.ts` is not in the
directory of the application or in its `src`, give the directory:
`withFlags({}, { dir: '/path/to/the/app' })`.

### 2️⃣ Connect the project to Vercel (zero configuration)

Without `flags.config.ts`, flags without a connection use Vercel Flags.
Locally, they use OFREP with the OIDC token of the project:

```sh
vercel link
vercel env pull
```

The token expires. Run `vercel env pull` again when the flags fail with an
error about the credential.

### 3️⃣ Optional: `flags.config.ts`

```ts
// flags.config.ts
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

declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
```

The file must export `config`. It can be `flags.config.ts`, `.mts`, `.js`
or `.mjs`. In development, a change applies without a restart.

## Usage

```tsx
// app/page.tsx
import { evaluate } from 'flags';
import { bannerText, summerSale } from '../flags';

export default async function Page() {
  const [sale, banner] = await evaluate([summerSale, bannerText]);
  return <h1>{sale ? banner : 'Welcome'}</h1>;
}
```

- **Server components** can evaluate the same flag again. Each flag is
  evaluated one time for each request, so all components get the same
  value.
- **Route handlers** call flags in the same way.
- **Client components:** flags run only on the server. Evaluate a flag in a
  server component, and give the value to the client component as a prop.
  Do not import `flags` in a file with `'use client'`.
- **Events:** add handlers in `register` of `instrumentation.ts`. All
  bundles of Next.js share one runtime:

  ```ts
  // instrumentation.ts
  export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    const { runtime } = await import('flags');
    runtime.addHandler('PROVIDER_CONFIGURATION_CHANGED', (details) => {
      console.log(`${details.providerName} changed`);
    });
  }
  ```

See the [Flags SDK](../flags) for flags, the evaluation context, overrides,
hooks and tracking.

## Precompute

Precompute evaluates flags in the proxy, puts their values into a signed
code in the URL, and renders a static page for each combination of values.
Thus, a page can be static and still show the values of each visitor.

```ts
// flags.ts
export const marketingFlags = [summerSale, checkout] as const;
```

```ts
// proxy.ts
import { precompute } from '@flags-sdk/next/precompute';
import { type NextRequest, NextResponse } from 'next/server';
import { marketingFlags } from './flags';

export async function proxy(request: NextRequest) {
  // The request goes to the evaluation context chain and to the overrides
  const code = await precompute(marketingFlags, { request });
  return NextResponse.rewrite(new URL(`/marketing/${code}`, request.url));
}

export const config = { matcher: '/marketing' };
```

```tsx
// app/marketing/[code]/page.tsx
import { generatePermutations, getPrecomputed } from '@flags-sdk/next/precompute';
import { checkout, marketingFlags, summerSale } from '../../../flags';

// Optional: build a page for each combination at build time
export async function generateStaticParams() {
  const codes = await generatePermutations(marketingFlags);
  return codes.map((code) => ({ code }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [sale, flow] = await getPrecomputed(
    [summerSale, checkout],
    marketingFlags,
    code,
  );
  return <h1>{sale ? 'Summer sale' : `Checkout: ${flow}`}</h1>;
}
```

- The code is signed, so a visitor can not set the values in the URL.
  `withFlags` puts a random secret for each build into the server code, so
  precompute needs no configuration. To set the secret, set
  `FLAGS_PRECOMPUTE_SECRET` for the build and for the runtime. It is not
  `FLAGS_SECRET` of the override cookies. Each function also accepts an
  explicit `secret`.
- Without `withFlags`, set `FLAGS_PRECOMPUTE_SECRET`, or precompute throws.
- To keep codes of v4 valid during the upgrade, set
  `FLAGS_PRECOMPUTE_SECRET` to the value of `FLAGS_SECRET` for that time.
- `getPrecomputed` reads the code. It does not evaluate the flags again, so
  the page stays static.
- `generatePermutations` needs `options` for each flag which is not a
  boolean. Use its `filter` to skip combinations which need no page.
- The API and the format of the code are those of v4. A code of v4 is
  valid in v5.
- Changes from v4: a flag is not a function of `(code, group)`. Use
  `getPrecomputed`. A flag which is not part of the code throws, and a flag
  without options which is not a boolean throws in `generatePermutations`.
- Precompute is not a part of the standard of the SDK. It uses only its
  public API.

## Discovery

Put your flags into modules which start with `'use flags'`, and add one
route file:

```ts
// app/.well-known/flags/manifest.json/route.ts
export { GET } from '@flags-sdk/next/manifest';
```

- `withFlags` registers the flags of each `'use flags'` module.
- In development, the route returns the manifest of all flags, with
  `no-store`. A new `'use flags'` file is in it without a restart. In
  production, the route returns 404.
- `next build` writes `flags-manifest.json` into `distDir`. The deployment
  adapter of the platform puts it into the build output.

## Deployment

On Vercel, the deployment adapter of Next.js points the module
`flags/default-provider` to the fast provider of Vercel Flags
(`@vercel/flags-core/default-provider`). Thus, flags without a connection
evaluate without a request for each flag, also with zero configuration.

- The adapter does this only for builds. Development uses OFREP, or the
  connection of `flags.config.ts`.
- A `defaultConnection` in `flags.config.ts` always wins over the provider of
  the platform.
- Without the deployment adapter, e.g. on a different host, flags without a
  connection use OFREP, and the SDK logs a warning in production: OFREP sends
  one request for each evaluation. Set a `defaultConnection` in
  `flags.config.ts` for production.

## How it works

`withFlags` sets two aliases of Turbopack (`turbopack.resolveAlias`):

| Alias               | Points to          | Default without the plugin |
| ------------------- | ------------------ | -------------------------- |
| `flags/framework` | `@flags-sdk/next/binding`       | no framework binding       |
| `flags/config`      | `flags.config.ts`  | no configuration           |

The SDK imports `flags/framework` itself, so the binding works in each
bundle that uses `flags`. The application never imports `@flags-sdk/next/binding`.

Before the first evaluation, the SDK calls `setupFramework` of
`@flags-sdk/next/binding`. It sets three things on the runtime:

1. **The request source.** No middleware of Next.js wraps the rendering of a
   page, but `headers()` and `cookies()` give the current request at any
   time. `headers()` returns the same object during one request, so the SDK
   identifies the request by it. It creates the evaluation context, and
   evaluates each flag, one time for each request. Outside of a request, `headers()` throws, and the source
   gives no request.
2. **The rethrow.** Next.js uses errors as signals, e.g. "Dynamic server
   usage" during the build, to detect that a page is dynamic. The SDK gives
   such errors to `unstable_rethrow`, so that they reach Next.js unchanged.
3. **The config source.** It loads `flags.config.ts` with
   `import('flags/config')`. In production, the SDK loads it one time. In
   development, it loads it again before each evaluation, so a change of
   `flags.config.ts` applies without a restart.

Next.js can put more than one copy of the SDK into one process, e.g. one for
each layer. All copies share one runtime through `globalThis`, so they share
the configuration, the providers and their clients.

## Gotchas

- **The request has no URL.** Server components of Next.js only have
  `headers()` and `cookies()`, so `request.url` of the evaluation context
  chain is `undefined`. A route handler can give a value of the URL to a
  flag with `evaluationContext`.

- **A page with a flag is dynamic.** The request source reads `headers()`,
  so Next.js renders the page for each request. This is correct: flags are
  dynamic, and overrides read the cookies of each request. Use
  `export const dynamic = 'force-static'` only when the page must not depend
  on the request.
- **No `'use client'`.** The SDK uses `node:async_hooks`, and it is only for
  the server.
- **The registration of the type must be in the TypeScript program.** If
  `tsconfig.json` does not include `flags.config.ts`, flags without a
  connection lose the types of the configured connection. The type check
  does not fail, but it is less strict.
- **The export must be `config`.** A default export of `flags.config.ts` is
  not read.
- **A conditional configuration loses its types.** E.g.
  `export const config = condition ? configA : configB` is a union, so the
  registered type falls back to the open context.
- **In production, a change of `flags.config.ts` needs a new build**, as
  with each other source file. Only development loads it again without a
  restart.
- **The adapter of the platform runs only for builds.** In development, the
  flags use OFREP or `flags.config.ts`, not the fast provider of the
  platform. Install `@vercel/flags-core` and set it in `flags.config.ts` for
  fast evaluations during development.
- **`VERCEL_OIDC_TOKEN` expires.** Run `vercel env pull` again when OFREP
  reports a credential that is not accepted.
- **Without `defaultValue`, each issue throws a `FlagEvaluationError`**: a
  provider that throws, an `errorCode`, the reason `ERROR`, a value of the
  wrong type or outside of the options, and an OFREP response which asks for
  the default of the code. With `defaultValue`, the flag returns it and logs
  one line instead.
- **One case can not be detected**: a provider that returns its default value
  without any sign of an issue, e.g. a disabled flag of
  `TypedInMemoryProvider`. OpenFeature requires a default, so the SDK passes
  a placeholder (`false`, `''`, `0` or `{}`), and the flag returns it. The
  reasons `DEFAULT` and `DISABLED` can not be used to detect this, because
  providers also use them for real values: `VercelProvider` reports `DEFAULT`
  for the fallthrough of a flag, and LaunchDarkly reports `DISABLED` with the
  "off" value of the system. Set `defaultValue` when the difference
  matters.
- **Flags evaluated in `generateStaticParams` or at build time** have no
  request. They use the evaluation context without a request.

## Not supported yet

- **A helper for flags in the proxy.** `precompute(flags, { request })`
  works in the proxy. For a flag call in the proxy, wrap it with
  `runtime.onInvoke(request, () => flag())`, because the proxy does not use
  `headers()` of `next/headers`. A shorter helper is planned.
- **Server actions.** They are not tested yet.
- **`onInit` and `onShutdown`.** Next.js has no hooks for them, except
  `register` in `instrumentation.ts`. Without them, providers are initialized
  on their first evaluation.
- **The Edge runtime.** It is not tested. The Edge runtime is deprecated.
- **The Pages Router.** It is not tested.

## For framework and platform authors

- `@flags-sdk/next` uses only the public API of `flags`, also
  `flags/tooling`, so that Next.js could take it over, e.g. as its own
  module behind the alias `flags/framework`.
- `@flags-sdk/next/binding` must not import `flags` at runtime, because
  `flags` imports it. It gets the runtime as an argument.
- `withFlags` adds two loaders: `@flags-sdk/next/use-flags-loader` for the
  self-registration of `'use flags'` modules, and
  `@flags-sdk/next/manifest-loader`, which puts the imports of these modules into
  `@flags-sdk/next/manifest`. After the compile
  (`compiler.runAfterProductionCompile`), it calls the compiled route of the
  manifest in a child process, and writes `flags-manifest.json`.
- A deployment adapter can read `flags-manifest.json` in `onBuildComplete`.
  See `tests/standard/next/adapter.mjs`.
- A deployment adapter sets the alias of `flags/default-provider` in
  `modifyConfig`, during `phase-production-build`. The adapter API is stable
  since Next.js 16.2, and the platform enables its adapter with
  `NEXT_ADAPTER_PATH`. See `tests/standard/next/adapter.mjs`.
- `tests/standard/next` runs 16 end-to-end tests with HTTP requests, without
  a browser:

  ```sh
  cd tests/standard/next
  pnpm test:e2e
  ```

  It builds two variants: Turbopack (`.next`), and Turbopack with the test
  adapter of the platform (`.next-platform`).

See also [For framework authors](../flags/FRAMEWORK-AUTHORS.md).

## License

MIT
