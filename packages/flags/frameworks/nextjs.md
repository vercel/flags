# Flags SDK with Next.js

This guide describes the integration of the Flags SDK (v5) with Next.js: the
installation, the setup, the usage, how it works, and the gotchas. The
contract between frameworks and the SDK is in `../SPEC.md`, section
"Framework integration contract".

Status: the integration works with the App Router and Turbopack. It does
not support webpack: a build with `--webpack` stops with an error.
`tests/standard/next` tests it with Turbopack and with a platform adapter.
Some parts are not done yet (see "Not supported yet").

## Requirements

- Next.js 15.4 or newer, with the App Router. It was tested with Next.js
  16.3.8. The integration uses `headers()` and `cookies()` as promises,
  `unstable_rethrow`, and `compiler.defineServer` (since Next.js 15.4) for
  the secret of precompute.
- Node.js 20.19, or 22.12 or newer.
- The flags run only on the server: in server components, route handlers and
  other server code.

## Installation

```sh
pnpm add flags
```

Zero configuration needs nothing else. For fast evaluations of Vercel Flags,
also on your own computer, install the OpenFeature provider of Vercel Flags:

```sh
pnpm add @vercel/flags-core @openfeature/server-sdk
```

## Setup

### 1. Add the plugin to `next.config.ts`

```ts
// next.config.ts
import { withFlags } from 'flags/next/plugin';

export default withFlags({
  // The configuration of Next.js, as usual
});
```

That is the only required step. `withFlags` keeps the configuration of the
application, also its own aliases and rules of Turbopack.

If `flags.config.ts` is not in the directory of the application or in its
`src` directory, give the directory:

```ts
export default withFlags({}, { dir: '/path/to/the/app' });
```

### 2. Connect the project to Vercel (zero configuration)

Without `flags.config.ts`, flags without a connection use Vercel Flags.
Locally, they use the OpenFeature Remote Evaluation Protocol (OFREP), with
the OIDC token of the project:

```sh
vercel link
vercel env pull
```

`vercel env pull` writes `VERCEL_OIDC_TOKEN` into `.env.local`. Next.js loads
it, and the SDK uses it as the credential. The token expires, so run
`vercel env pull` again when the flags fail with an error about the
credential.

On a deployment to Vercel, the platform adapter replaces OFREP with a fast
provider (see "Deployment").

### 3. Optional: `flags.config.ts`

Write `flags.config.ts` when you need more: an evaluation context, a
different provider, fast evaluations during development, or options for
overrides. The flags do not change.

```ts
// flags.config.ts
import { VercelProvider } from '@vercel/flags-core/openfeature';
import { defineConfig, defineConnection } from 'flags';

export const config = defineConfig({
  defaultConnection: defineConnection({
    provider: new VercelProvider(),
    project: { platform: 'vercel' },
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

- The file must export `config`. A default export is not read.
- The file can be `flags.config.ts`, `.mts`, `.js` or `.mjs`.
- `defaultConnection` can use any OpenFeature provider, not only Vercel
  Flags.
- `overrides` sets which override tokens the SDK accepts (see `../SPEC.md`,
  section "Overrides").

## Usage

### Define flags

```ts
// flags.ts
import { defineFlag } from 'flags';

export const summerSale = defineFlag({ key: 'summer-sale' });
export const bannerText = defineFlag({
  key: 'banner-text',
  type: 'string',
  defaultValue: 'Welcome',
});
export const checkout = defineFlag({
  key: 'checkout',
  type: 'string',
  options: ['control', 'express'],
  defaultValue: 'control',
});
```

Without `type`, a flag is a boolean. The types are `boolean`, `string`,
`number` and `object`.

Short forms are available for the common cases:

```ts
export const summerSale = defineFlag('summer-sale'); // a boolean
export const bannerText = defineFlag('banner-text', 'Welcome'); // a string
export const maxItems = defineFlag(shop, 'max-items', 10); // a connection
```

The short forms take the type from `defaultValue`. For `options` and
`getEvaluationContext`, use the full form.

### Server components

```tsx
// app/page.tsx
import { evaluate } from 'flags';
import { bannerText, summerSale } from '../flags';

export default async function Page() {
  const [sale, banner] = await evaluate([summerSale, bannerText]);
  return <h1>{sale ? banner : 'Welcome'}</h1>;
}
```

A nested server component can evaluate the same flag again. The SDK
evaluates each flag one time for each request, so all components get the
same value, and the provider gets one call (see "How it works").

### Route handlers

```ts
// app/api/checkout/route.ts
import { checkout } from '../../../flags';

export async function GET() {
  return Response.json({ checkout: await checkout() });
}
```

### Client components

Flags run only on the server. Evaluate them in a server component, and give
the value to the client component as a prop:

```tsx
// app/page.tsx (a server component)
import { Banner } from './banner'; // a client component
import { bannerText } from '../flags';

export default async function Page() {
  return <Banner text={await bannerText()} />;
}
```

Do not import `flags` in a file with `'use client'`.

### Evaluation context from the call side

A route can give an evaluation context, e.g. a value from its path:

```ts
// app/api/teams/[teamId]/route.ts
import { teamInsights } from '../../../../flags';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  return Response.json({
    insights: await teamInsights({ evaluationContext: { teamId } }),
  });
}
```

The `getEvaluationContext` of the connection receives `{ teamId }` (see
`../SPEC.md`, section "Evaluation context chain").

### Hooks, events and tracking

Set hooks for all flags in `flags.config.ts`, e.g. to report overrides:

```ts
// flags.config.ts
import { defineConfig, OVERRIDE_REASON } from 'flags';

export const config = defineConfig({
  hooks: [
    {
      after(hookContext, details) {
        if (details.reason === OVERRIDE_REASON) {
          console.log(`Override of ${hookContext.flagKey}`);
        }
      },
    },
  ],
});
```

Record tracking events in server code, e.g. in a route handler:

```ts
// app/api/checkout/route.ts
import { track } from 'flags';

export async function POST() {
  await track('purchase', { details: { value: 99 } });
  return Response.json({ ok: true });
}
```

Add event handlers in `register` of `instrumentation.ts`. All bundles of
Next.js share one runtime, so the handlers receive the events of the
providers of the pages:

```ts
// instrumentation.ts
export async function register() {
  // The SDK runs only in the Node.js runtime
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { runtime } = await import('flags');
  runtime.addHandler('PROVIDER_CONFIGURATION_CHANGED', (details) => {
    console.log(`${details.providerName} changed`, details.flagsChanged);
  });
}
```

See `../SPEC.md`, section "Hooks, events and tracking".

### Precompute

Precompute evaluates flags in the proxy, puts their values into a signed
code in the URL, and renders a static page for each combination of values.
Thus, a page can be static and still show the values of each visitor.

```ts
// flags.ts
export const marketingFlags = [summerSale, checkout] as const;
```

```ts
// proxy.ts
import { precompute } from 'flags/next/precompute';
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
import { generatePermutations, getPrecomputed } from 'flags/next/precompute';
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

### Discovery for Flags Explorer (optional)

Put the flags into modules which start with `'use flags'`. Such a module
exports only flags, and importing it has no side effects:

```ts
// flags.ts
'use flags';

import { defineFlag } from 'flags';

export const summerSale = defineFlag('summer-sale', false);
export const bannerText = defineFlag({
  key: 'banner-text',
  type: 'string',
  defaultValue: 'Welcome',
  description: 'The text of the banner',
});
```

Add one route file:

```ts
// app/.well-known/flags/manifest.json/route.ts
export { GET } from 'flags/next/manifest';
```

- `withFlags` registers the flags of each `'use flags'` module, so you do
  not call `registerFlags`.
- In development, the route returns the manifest of all flags, with
  `no-store`. In production, it returns 404.
- `next build` writes the manifest into `flags-manifest.json` in `distDir`.
  The platform adapter puts it into the build output.
- A new `'use flags'` file is in the manifest without a restart of
  `next dev`.

See `../SPEC.md`, section "Discovery".

### Static pages

A page that Next.js renders at build time has no request. Its flags use the
evaluation context without a request, e.g. the user `anonymous` in the
example above. Thus, a static page shows the same value to each user.

## Deployment

On Vercel, the platform adapter of Next.js points the module
`flags/default-provider` to the fast provider of Vercel Flags
(`@vercel/flags-core/default-provider`). Thus, flags without a connection
evaluate without a request for each flag, also with zero configuration.

- The adapter does this only for builds. Development uses OFREP, or the
  connection of `flags.config.ts`.
- A `defaultConnection` in `flags.config.ts` always wins over the provider of
  the platform.
- Without the platform adapter, e.g. on a different host, flags without a
  connection use OFREP, and the SDK logs a warning in production: OFREP sends
  one request for each evaluation. Set a `defaultConnection` in
  `flags.config.ts` for production.

## How it works

`withFlags` sets two aliases of Turbopack (`turbopack.resolveAlias`):

| Alias               | Points to          | Default without the plugin |
| ------------------- | ------------------ | -------------------------- |
| `flags/integration` | `flags/next`       | no integration             |
| `flags/config`      | `flags.config.ts`  | no configuration           |

The SDK imports `flags/integration` itself, so the integration works in each
bundle that uses `flags`. The application never imports `flags/next`.

Before the first evaluation, the SDK calls `setupIntegration` of
`flags/next`. It sets three things on the runtime:

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
  "off" value of the platform. Set `defaultValue` when the difference
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

## For the authors of the integration

- `flags/next` and `flags/next/plugin` use only the public API of the SDK, so
  that Next.js could take them over, e.g. as its own module behind the alias
  `flags/integration`.
- `flags/next` must not import `flags` statically, because `flags` imports
  it. It gets the runtime as an argument.
- `withFlags` adds two loaders: `flags/next/use-flags-loader` for the
  self-registration of `'use flags'` modules, and
  `flags/next/manifest-loader`, which puts the imports of these modules into
  `flags/next/manifest`. After the compile
  (`compiler.runAfterProductionCompile`), it calls the compiled route of the
  manifest in a child process, and writes `flags-manifest.json`.
- A platform adapter can read `flags-manifest.json` in `onBuildComplete`.
  See `tests/standard/next/adapter.mjs`.
- A platform adapter sets the alias of `flags/default-provider` in
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
