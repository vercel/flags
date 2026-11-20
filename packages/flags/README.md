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
- **Explicit sources.** Each flag names its source. By convention, the main
  source of an application is `flags/sources/self`.
- **Code generation, if you want it.** Put each source into
  `flags/sources/<source>`, and import its flags with
  `import { 'summer-sale' as summerSale } from 'flags:self'`. The generated
  code is the same as `defineSource` and `bindFlag` by hand. With
  `@vercel/flags-core`, `flags:self` has the flags of your Vercel project,
  without a folder.
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
export const summerSale = bindFlag({
  key: 'summer-sale',
  source: self,
  defaultValue: false,
});

// app/page.tsx
const sale = await summerSale();
```

The source (the provider of the flag management system, and the evaluation
context) is set up one time, for all its flags.

## How it works

### 1️⃣ Set up your framework

One time, with the package of your framework:

```ts
// next.config.ts
import { withFlags } from '@flags-sdk/next/plugin';

export default withFlags({});
```

The framework package gives the SDK the current request, loads
`flags/config.ts`, and lets the signals of the framework through, e.g. a
redirect.

### 2️⃣ Connect your flag management system

A source connects flags to an OpenFeature provider, and creates the
evaluation context from the request:

```sh
pnpm add @vercel/flags-core @openfeature/server-sdk
```

### 3️⃣ Define your flags

```ts
// flags.ts
'use flags';

import { bindFlag, defineFlag, defineSource } from 'flags';
import { VercelProvider } from '@vercel/flags-core/openfeature';

// The main source of the application
const self = defineSource({
  provider: new VercelProvider(),
  project: { system: 'vercel-flags' },
  getEvaluationContext: (request) => ({
    user: request?.cookies?.get('user')?.value ?? 'anonymous',
  }),
});

// A flag of the source
export const checkout = bindFlag({
  key: 'checkout',
  source: self,
  type: 'string',
  options: ['control', 'express'],
  defaultValue: 'control',
  description: 'The checkout flow',
});

// An inline flag, which the code decides
export const summerSale = defineFlag({
  key: 'summer-sale',
  decide: () => Date.now() > Date.parse('2026-06-21'),
});
```

`'use flags'` is optional. It lets Flags Explorer find the flags (see
[Discovery](#discovery)). Code generation can write the sources and flags
for you, so that you import them from `flags:<source>` (see
[Code generation](#code-generation)).

### 4️⃣ Evaluate them on the server

```ts
// app/page.tsx
import { evaluate } from 'flags';
import { checkout, summerSale } from '../flags';

export default async function Page() {
  const [sale, flow] = await evaluate([summerSale, checkout]);
  // flow has the type 'control' | 'express' | (string & {})
}
```

TL;DR:

- The framework package connects the SDK to the request, one time.
- A source connects the flags to your flag management system.
- Your code defines flags and calls them.
- Optional: `flags/config.ts` holds settings for all flags: hooks and
  overrides.

## Flags

```ts
// A flag of a source: its provider decides the value
bindFlag({ key: 'summer-sale', source: self }); // a boolean
bindFlag({ key: 'banner-text', source: self, type: 'string', defaultValue: 'Welcome' });
bindFlag({ key: 'max-items', source: shop, type: 'number', defaultValue: 10 });
bindFlag({ key, source, type, options, defaultValue, description, getEvaluationContext });

// An inline flag: the code decides the value
defineFlag({
  key: 'beta-banner',
  decide: (request) => request?.cookies?.get('beta')?.value === '1',
  options: [false, true] as const, // optional
});
```

- The types are `boolean` (the default), `string`, `number` and `object`
  (any JSON value). Set `type` for each type other than `boolean`.
- `options` are for Flags Explorer and precompute. The editor suggests
  them, but the provider can also return other values of the type, e.g. a
  variant which was added after the deployment.
- `source` is required for `bindFlag`. There is no default source.
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
3. the source creates the context for the provider, also from the
   request: its headers, its cookies and its URL.

Each `getEvaluationContext` and each `decide` receives the request first,
then the context: `(request, context)`. `request` is `undefined` outside of
a request.

TypeScript checks that each flag gets the context which its source
needs. `evaluate([a, b], { evaluationContext })` gives one context to
several flags.

## More than one flag management system

A source is a provider plus a project in a flag management system, plus
the function which creates the evaluation context.
Each flag names its source, so a second source can use a different
provider or a different project:

```ts
// The flags of a different Vercel project, e.g. of a different team
const blog = defineSource({
  provider: new VercelProvider(process.env.BLOG_FLAGS!),
  project: {
    system: 'vercel-flags',
    projectId: 'prj_blog',
    teamId: 'team_acme',
  },
});

export const newSearch = bindFlag({ key: 'new-search', source: blog });
```

- With `project: { system: 'vercel-flags' }`, the flag project is the
  Vercel project of the deployment. `projectId`, and `teamId` for a
  different team, select a different project. The SDK key of the provider
  must be of the same project.
- Any other OpenFeature provider works in the same way, e.g.
  `{ system: 'launchdarkly', projectId, teamId }`.

A system which the SDK does not list yet adds itself with a pull request
(see [For framework authors](./FRAMEWORK-AUTHORS.md)).

## Code generation

Code generation is optional. Each source is a directory
`flags/sources/<source>` with two files and one optional file:

- `catalog.ts` loads the flags of the flag management system;
- `provider.ts` exports the OpenFeature provider;
- `context.ts` (optional) exports `getEvaluationContext(request, input)`.
  Without it, the provider gets only the evaluation context of the call
  side.

By convention, the main source is `flags/sources/self`. The SDK generates
`.flags/self.ts` from it, and your code imports its flags from `flags:self`:

```ts
import { 'summer-sale' as summerSale } from 'flags:self';
```

The framework packages with a bundler generate the modules for you, by
default, e.g. `withFlags({})` for Next.js. They generate one time for a
build, and watch the catalogs in development. They also write the types in
`flags/generated.d.ts`, so you do not configure TypeScript. To turn it off,
use `disableCodeGeneration: true`. Without a
bundler, e.g. with Hono or Express, run `flags sync` (or `flags watch`),
and import `./.flags/self.ts`.

### The default source `self`

An application which depends on `@vercel/flags-core` has the source `self`
by default, with the flags of its Vercel project. It needs no folder
`flags/sources/self`. Its provider is `new VercelProvider()` of
`@vercel/flags-core/openfeature`, its catalog is
`@vercel/flags-core/catalog`, and it has no evaluation context. Each file in
`flags/sources/self` replaces its part, e.g. `context.ts` adds an evaluation
context. Each other source needs `provider.ts` and `catalog.ts`.

Run `vercel link` and `vercel env pull` for the credentials. Without them,
`flags:self` has no flags, and the SDK warns. To turn off the default source,
use `disableSelfSource: true` in the plugin, or
`flags sync --disable-self-source`.

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
  Vercel. Only Vercel can decrypt them. The protected header contains the
  Vercel project ID. Pass `projectIds` to `encryptFlagValues` for more than
  one project, e.g. for microfrontends.
- With `FLAGS_SECRET`, they use the format of v4.
- `serializeFlagValues(values)` without encryption shows the values to each
  visitor. Use it only if this is acceptable.

## Hooks, events and tracking

The SDK runs the OpenFeature parts which the OpenFeature client usually runs:

```ts
// flags/config.ts
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

- **Hooks** of the configuration, of a source, of a call, and of the
  provider. An override has the reason `OVERRIDE`.
- **Events:** `runtime.addHandler('PROVIDER_CONFIGURATION_CHANGED', handler)`.
- **Tracking:** `await track(self, 'purchase', { details: { value: 99 } })`.
  `track` needs the source.

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
import { config } from './flags/config';

runtime.configure(config);
await runtime.onInit(); // optional: initialize the providers at startup

// For each request, e.g. in a middleware
await runtime.onInvoke(request, () => handle(request));
```

- `request` is a Web `Request`, or an object with `headers`, `cookies` or
  `url`.
- `flags manifest` writes the manifest of the flags after the build.
- For code generation, run `flags sync`, and import `./.flags/self.ts`.
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
