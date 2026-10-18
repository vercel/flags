# Flags SDK

Feature flags for the server, for any framework and any flag management
system. The Flags SDK uses OpenFeature providers as they are, and gives your
application one small API: define a flag, then call it.

```ts
const sale = await summerSale();
```

## Features

- **Any flag management system.** Use the OpenFeature provider of Vercel
  Flags, LaunchDarkly, Statsig or any other system, without a wrapper.
- **Zero configuration on Vercel.** Without configuration, flags use Vercel
  Flags. A deployment on Vercel uses a fast provider, and development uses
  the OIDC token of `vercel env pull`.
- **One value for each request.** Each flag is evaluated one time for each
  request, so all parts of a page get the same value.
- **Typed.** Flags have a type and options, and TypeScript checks the
  evaluation context which each flag needs.
- **Overrides.** Flags Explorer of the Vercel Toolbar can override a flag for
  your browser, with a signed cookie.
- **Framework packages.** One package for each framework connects the SDK to
  the request, the configuration and the build. Your code imports only
  `flags`.

## Installation

```sh
pnpm add flags @flags-sdk/next
```

Use the package of your framework:

| Framework      | Package                     | Setup                                                    |
| -------------- | --------------------------- | -------------------------------------------------------- |
| Next.js        | `@flags-sdk/next`           | [`withFlags` in `next.config.ts`](../framework-next)     |
| SvelteKit      | `@flags-sdk/sveltekit`      | [`flags()` in `vite.config.ts`](../framework-sveltekit)  |
| Nuxt           | `@flags-sdk/nuxt`           | [a module in `nuxt.config.ts`](../framework-nuxt)        |
| TanStack Start | `@flags-sdk/tanstack-start` | [`flags()` in `vite.config.ts`](../framework-tanstack-start) |
| Hono           | `@flags-sdk/hono`           | [a middleware](../framework-hono)                        |
| Express        | `@flags-sdk/express`        | [a middleware](../framework-express)                     |

Without a framework, see [Without a framework](#without-a-framework).
Node.js 20.19, or 22.12 or newer.

## The problem

Without an SDK, each place which needs a flag talks to the provider itself:

```ts
// app/page.tsx
import { flagsClient } from '@vercel/flags-core';

const user = await loadUser(await cookies());
const { value: sale } = await flagsClient.evaluate('summer-sale', false, {
  user: { id: user.id },
});
```

This works, until:

- each page builds the user context again, and two components of one page
  get different values;
- a change of the flag management system changes each call;
- a developer wants to test a flag in production, without changing it for
  all users;
- a framework has no place to set this up one time.

## The solution

Declare a flag one time, and call it where you need it:

```ts
// flags.ts
export const summerSale = defineFlag('summer-sale', false);

// app/page.tsx
const sale = await summerSale();
```

The connection to the flag management system, and the evaluation context,
are set up one time, for all flags.

## How it works

### 1️⃣ Set up your framework

One time, with the package of your framework:

```ts
// next.config.ts
import { withFlags } from '@flags-sdk/next/plugin';

export default withFlags({});
```

The framework package gives the SDK the current request, loads
`flags.config.ts`, and lets the signals of the framework through, e.g. a
redirect.

### 2️⃣ Connect to your flag management system

Optional. Without `flags.config.ts`, flags use Vercel Flags. With it, you
choose the OpenFeature provider, and how the evaluation context is created:

```sh
pnpm add @vercel/flags-core @openfeature/server-sdk
```

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

// Gives flags without a connection the types of this connection
declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
```

### 3️⃣ Define your flags

```ts
// flags.ts
'use flags';

import { defineFlag } from 'flags';

export const summerSale = defineFlag('summer-sale', false);
export const checkout = defineFlag({
  key: 'checkout',
  type: 'string',
  options: ['control', 'express'],
  defaultValue: 'control',
  description: 'The checkout flow',
});
```

`'use flags'` is optional. It lets Flags Explorer find the flags (see
[Discovery](#discovery)).

### 4️⃣ Evaluate them on the server

```ts
// app/page.tsx
import { evaluate } from 'flags';
import { checkout, summerSale } from '../flags';

export default async function Page() {
  const [sale, flow] = await evaluate([summerSale, checkout]);
  // flow has the type 'control' | 'express'
}
```

TL;DR:

- The framework package connects the SDK to the request, one time.
- `flags.config.ts` connects the flags to your flag management system.
- Your code defines flags and calls them.

## Flags

```ts
defineFlag('summer-sale'); // a boolean, without a default value
defineFlag('banner-text', 'Welcome'); // the type comes from the default value
defineFlag(connection, 'max-items', 10); // a flag of a different connection
defineFlag({ key, type, options, defaultValue, description, connection });
```

- The types are `boolean` (the default), `string`, `number` and `object`.
- `options` makes the type a union of the options, and a value which is not
  an option fails.
- **With `defaultValue`**, a flag which can not be evaluated returns it and
  logs one line. **Without `defaultValue`**, it throws a
  `FlagEvaluationError`.
- Flags run only on the server. Do not import `flags` in client code: give
  the value to the client, e.g. as a prop.

## The evaluation context

The evaluation context is what the provider uses for its rules, e.g. the
user. It is created in a chain, one time for each request:

1. the call side can give a context: `teamInsights({ evaluationContext: { teamId } })`;
2. the flag can convert it with its own `getEvaluationContext`;
3. the connection creates the context for the provider, also from the
   request: its headers, its cookies and its URL.

TypeScript checks that each flag gets the context which its connection
needs. `evaluate([a, b], { evaluationContext })` gives one context to
several flags.

## More than one flag management system

A connection is a provider plus a project in a flag management system.
Flags without a connection use the default connection. Other flags name
their connection:

```ts
// The flags of a different Vercel project, e.g. of a different team
const blog = defineConnection({
  provider: new VercelProvider(process.env.BLOG_FLAGS!),
  project: {
    system: 'vercel-flags',
    projectId: 'prj_blog',
    teamId: 'team_acme',
  },
});

export const newSearch = defineFlag(blog, 'new-search');
```

- With `project: { system: 'vercel-flags' }`, the flag project is the
  Vercel project of the deployment. `projectId`, and `teamId` for a
  different team, select a different project. The SDK key of the provider
  must be of the same project.
- Any other OpenFeature provider works in the same way, e.g.
  `{ system: 'launchdarkly', projectId, teamId }`.

A system which the SDK does not list yet adds itself with a pull request
(see [For framework authors](./FRAMEWORK-AUTHORS.md)).

## Overrides

Flags Explorer of the Vercel Toolbar overrides a flag for your browser, with
a cookie. The SDK accepts two kinds of cookies:

- **Signed by Vercel.** On Vercel, or with `vercel env pull`, it needs no
  configuration.
- **Encrypted with `FLAGS_SECRET`**, as in v4. With `FLAGS_SECRET`, the SDK
  accepts only these.

```ts
import { encryptOverrides } from 'flags';

const cookie = await encryptOverrides({ 'summer-sale': true }); // e.g. in a test
```

## Flag values in the page

A page can contain the values of its flags, for Flags Explorer and for
analytics. The framework packages write the element, e.g. `<FlagValues>`
of `@flags-sdk/next/flag-values`. Other code uses the functions of
`flags`:

```ts
import { encryptFlagValues, serializeFlagValues } from 'flags';

const content = serializeFlagValues(await encryptFlagValues(values));
// <script type="application/json" data-flag-values>${content}</script>
```

- Without `FLAGS_SECRET`, the values are encrypted with the public key of
  Vercel. Only Vercel can decrypt them.
- With `FLAGS_SECRET`, they use the format of v4.
- `serializeFlagValues(values)` without encryption shows the values to each
  visitor. Use it only if this is acceptable.

## Hooks, events and tracking

The SDK runs the OpenFeature parts which the OpenFeature client usually runs:

```ts
// flags.config.ts
import { defineConfig, OVERRIDE_REASON } from 'flags';

export const config = defineConfig({
  hooks: [
    {
      after(hookContext, details) {
        if (details.reason === OVERRIDE_REASON) report(hookContext.flagKey);
      },
    },
  ],
});
```

- **Hooks** of the configuration, of a connection, of a call, and of the
  provider. An override has the reason `OVERRIDE`.
- **Events:** `runtime.addHandler('PROVIDER_CONFIGURATION_CHANGED', handler)`.
- **Tracking:** `await track('purchase', { details: { value: 99 } })`.

## Discovery

Modules which start with `'use flags'` export only flags, and importing them
has no side effects. The framework packages find them, and write a manifest
of your flags for Flags Explorer:

- in development, at `/.well-known/flags/manifest.json`;
- after a build, as `flags-manifest.json` in the server output.

The manifest has the type, the options, the default value and the
description of each flag, and the variables which tools need to link to
the dashboard of your flag management system. It has no values and no
secrets.

## Without a framework

```ts
import { runtime } from 'flags';
import { config } from './flags.config';

runtime.configure(config);
await runtime.onInit(); // optional: initialize the providers at startup

// For each request, e.g. in a middleware
await runtime.onInvoke(request, () => handle(request));
```

- `request` is a Web `Request`, or an object with `headers`, `cookies` or
  `url`.
- `flags manifest` writes the manifest of the flags after the build.
- Call `runtime.onShutdown()` when the process stops.

## The packages

- **`flags`:** the runtime and the API for your application.
- **`@flags-sdk/<framework>`:** the setup for one framework. A framework
  can include this part itself later.
- **`flags/tooling`:** functions for framework packages and build tools. See
  [For framework authors](./FRAMEWORK-AUTHORS.md).
- **`@flags-sdk/conformance`:** checks that a framework follows
  [the standard](./STANDARD.md).

## Examples

`tests/standard` has a small app for each framework, with end-to-end tests:
[Next.js](../../tests/standard/next),
[SvelteKit](../../tests/standard/sveltekit),
[Nuxt](../../tests/standard/nuxt),
[TanStack Start](../../tests/standard/tanstack-start),
[Hono](../../tests/standard/hono) and
[Express](../../tests/standard/express).

## Relationship to other solutions

- **The OpenFeature SDK.** The Flags SDK uses OpenFeature providers, hooks
  and events, but not the OpenFeature client. It adds what servers of web
  frameworks need: one context for each request, the request of the
  framework, overrides, and typed flags.
- **The SDK of a flag management system.** You can use it directly. The
  Flags SDK puts it behind one API, so that a change of the system does not
  change your code.
- **Flags SDK v4.** v5 uses OpenFeature providers instead of adapters, and
  framework packages instead of `flags/next` and `flags/sveltekit`.
  Precompute and the format of overrides stay compatible.

## License

MIT
