---
name: flags-sdk
description: >
  Write feature flag code with the Flags SDK v5 (the `flags` npm package) and Vercel Flags.
  Use when installing or configuring the SDK, adding a flag to code, or changing flag code:
  `defineFlag` (inline flags), `bindFlag` and `defineSource` (provider flags), the file system
  API (`flags/sources/<source>/provider.ts`, `catalog.ts`, `context.ts`, `hooks.ts`) with
  `import { ... } from 'flags:<source>'`, the default source `flags:self` of
  `@vercel/flags-core` (`"selfSource": false` in `flags/config.json`), code generation (`flags sync`, `flags watch`,
  `.flags/`, `flags/generated.d.ts`), `'use flags'` modules, `evaluate`, `runtime`,
  `flags/hooks.ts`, `flags/overrides.ts`, `flags/config.json`, the framework packages (`withFlags` of `@flags-sdk/next/plugin`,
  `@flags-sdk/sveltekit`, `@flags-sdk/nuxt`, `@flags-sdk/tanstack-start`, `@flags-sdk/hono`,
  `@flags-sdk/express`, `@flags-sdk/vite`), precompute (`@flags-sdk/next/precompute`),
  `FlagValues`, Flags Explorer and its manifest route, overrides, `FLAGS_SECRET`,
  `signOverrides`, `encryptOverrides`, OpenFeature providers (`VercelProvider` of
  `@vercel/flags-core/openfeature`, LaunchDarkly, GrowthBook, Flagsmith, Statsig, PostHog,
  in-memory, custom), Project Connections in code, and upgrading from v4 (`flag()` of
  `flags/next`, adapters, `identify`, `dedupe`). For planning a flag, the `vercel flags` CLI
  beyond create and inspect, rollouts, experiments, and archiving or deleting flags, use the
  `vercel-flags` skill.
---

# Use the Flags SDK v5

The Flags SDK (npm package `flags`) turns each feature flag into an async function that runs on the server. It works in Next.js, SvelteKit, Nuxt, TanStack Start, Hono, Express and plain Node.js. Providers are OpenFeature server providers, used as they are. Vercel Flags is the first-party provider: `VercelProvider` of `@vercel/flags-core/openfeature`.

- Docs: https://flags-sdk.dev
- Repo: https://github.com/vercel/flags

This skill covers the code. The `vercel-flags` skill covers planning a flag, the `vercel flags` CLI, rollouts, experiments and cleanup. Archiving a flag, deleting it, or removing a variant needs the checks of that skill (remove the code first, check that there are no evaluations over the Skew Protection window, archive before `rm`). Do not run these commands without it. If it is not available, suggest `npx skills add vercel/flags@vercel-flags` (do not install it yourself), and use `vercel flags <cmd> --help` in the meantime.

Run the CLI steps of this skill yourself. Do not leave them to the user as "next steps". Inside an app repository, treat an ambiguous request ("add a flag for X") as the full flow: set up the SDK if needed, create the flag, and use it in code.

## Core concepts

- **A flag is an async function.** Call it on the server: `const sale = await enableSale()`. It returns the value, not the details.
- **Two kinds of flags.**
  - An **inline flag**, `defineFlag({ key, decide })`, decides its value in code. `decide(request, context)` receives the current request (`undefined` outside a request) and the evaluation context of the call side.
  - A **provider flag**, `bindFlag({ key, source })`, asks the OpenFeature provider of a source.
- **A source** is `defineSource({ provider, project?, getEvaluationContext?, hooks? })`. Each provider flag names its source. The runtime has no default source. By convention, the main source of an app is `self`. With `@vercel/flags-core` in `package.json`, the code generation gives the default source `self` of Vercel Flags (see below).
- **The evaluation context** comes from a chain: call side (`flag({ evaluationContext })`) → flag (`getEvaluationContext` of `bindFlag`) → source (`getEvaluationContext(request, input)`) → provider. Each step is optional and runs once per request and input. This replaces `identify` and `dedupe` of v4. The SDK does not merge the steps: each step returns the complete input of the next one.
- **Types.** Without `type`, a flag is a boolean. Set `type: 'string' | 'number' | 'object'` for every other flag. The SDK does not infer the type from `defaultValue` or `options`. `object` is any JSON value.
- **`options`** list the known values, for Flags Explorer and precompute. They do not limit the value: a new variant goes through.
- **`defaultValue`** is returned when the evaluation fails, and the SDK logs one line. Without it, the call throws a `FlagEvaluationError`.
- **One value per request.** Each flag is evaluated once per request and context. Use `evaluate([a, b])` to evaluate several flags in parallel.
- **`'use flags'` modules.** A module that starts with `'use flags'` exports only flags. The framework plugins register these flags, and the flags manifest for Flags Explorer lists them. Generated modules have the directive already.
- **The runtime** (`runtime` of `flags`) knows the current request, initializes each provider once, and closes it at shutdown. The framework package connects it to the request. Without a framework, call `runtime.onInvoke(request, next)` yourself.
- **App code imports only `flags`** (and `flags:<source>`). The framework packages are only for the setup, plus precompute and `FlagValues` in Next.js.

## Decide the setup

**File system API with code generation** (recommended for Next.js, SvelteKit, Nuxt, TanStack Start). With Vercel Flags, you need no folder: an app with `@vercel/flags-core` in any dependency field of `package.json` gets the default source `self`, with the flags of its Vercel project (provider `new VercelProvider()`, catalog `@vercel/flags-core/catalog`, no context). Each file in `flags/sources/self/` replaces only its part, e.g. `context.ts` alone adds the evaluation context. Every other source, and `self` without `@vercel/flags-core`, needs a folder with `provider.ts` and `catalog.ts`.

For other providers, put a source into a folder. The plugin generates `.flags/<source>.ts` and the types in `flags/generated.d.ts`, and resolves `import { enableSale } from 'flags:self'`:

```txt
flags/                    # in the app root or in src/ (SvelteKit: always src/flags)
  config.json             # optional: static settings, e.g. { "selfSource": false }
  hooks.ts                # optional: default export: the hooks for all flags (Hook[])
  overrides.ts            # optional: default export: the override options (OverridesOptions)
  sources/
    self/
      provider.ts         # default export: an OpenFeature provider (optional for the default source self)
      catalog.ts          # default export: a CatalogLoader, build and dev only, in Node.js (optional for self)
      context.ts          # optional: default export getEvaluationContext(request, input)
      hooks.ts            # optional: default export: the hooks of this source (Hook[])
  generated.d.ts          # generated types, commit it or run `flags sync` before tsc
                          # (without flags/sources: src/flags/generated.d.ts if the app has src/)
.flags/                   # generated modules, ignored by its own .gitignore
```

**Hand-written sources** (Hono, Express, plain Node.js, or when the user prefers code): write `defineSource` in one module (e.g. `flags/self.ts`) and the `bindFlag` calls in a `'use flags'` module (e.g. `flags.ts`). The generated code is the same code, so the call sites do not change when you switch. In a framework with a plugin and `@vercel/flags-core`, also set `"selfSource": false` in `flags/config.json`.

Inline flags (`defineFlag`) go into a hand-written `'use flags'` module in both setups.

| Framework      | Package                     | Setup                                                    |
| -------------- | --------------------------- | -------------------------------------------------------- |
| Next.js        | `@flags-sdk/next`           | `export default withFlags({...})` in `next.config.ts`    |
| SvelteKit      | `@flags-sdk/sveltekit`      | `flags()` of `@flags-sdk/sveltekit/vite` in `vite.config.ts` |
| Nuxt           | `@flags-sdk/nuxt`           | `modules: ['@flags-sdk/nuxt']` in `nuxt.config.ts`       |
| TanStack Start | `@flags-sdk/tanstack-start` | `flags()` of `@flags-sdk/tanstack-start/vite` in `vite.config.ts` |
| Hono           | `@flags-sdk/hono`           | `app.use(flags())`, sources by hand                      |
| Express        | `@flags-sdk/express`        | `app.use(flags())`, sources by hand                      |
| No framework   | none                        | `runtime.onInvoke(request, next)` per request            |
| Other Vite app | `@flags-sdk/vite`           | `flags()` Vite plugin (for framework packages)           |

Precompute exists for Next.js only. See [references/frameworks.md](references/frameworks.md) for the full setup of each framework.

## Before you start

Check the project, and skip the steps that are done:

- **Package manager**: use the lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lock`/`bun.lockb`) to pick `pnpm add`, `npm install`, `yarn add` or `bun add`.
- **SDK version**: is `flags` in `package.json`, and which major? Code with `flag()` from `flags/next` or `flags/sveltekit`, `@flags-sdk/vercel`, `identify`, `dedupe` or `app/.well-known/vercel/flags/route.ts` is v4. Do not mix v4 and v5 APIs. Ask the user before you upgrade, then follow [references/upgrading-from-v4.md](references/upgrading-from-v4.md).
- **Framework**: which framework, and does it have a bundler? This selects the package and the setup.
- **Sources**: does `flags/sources/` (or `src/flags/sources/`) exist? Which sources? Is there a hand-written `defineSource`? Is `@vercel/flags-core` in `package.json` (then `flags:self` is the default source, unless `flags/config.json` sets `"selfSource": false`)?
- **Vercel link**: run `vercel project inspect --non-interactive` and check the owner and project name. A `.vercel/` folder alone does not prove a link. If it reports `link_required`, run `vercel link`. If the user named a project or team and the output differs, stop and ask.
- **Credentials**: does `.env.local` contain `VERCEL_OIDC_TOKEN=` (or an SDK key in `FLAGS=`)? Do not print the values.
- **Flags Explorer**: in Next.js, does `app/.well-known/flags/manifest.json/route.ts` exist? Is `@vercel/toolbar` installed?

> **Prerequisite**: The Vercel CLI must be installed and authenticated. If it is not installed, run `pnpm i -g vercel`. For authentication or link problems, follow the `vercel-cli` skill if it is available. If it is not, suggest `npx skills add vercel/vercel@vercel-cli` (do not install it yourself), and use `vercel <command> --help` in the meantime.

## Set up the SDK with Vercel Flags

One-time setup. The example is Next.js; the other frameworks differ only in steps 1, 2 and 6 ([references/frameworks.md](references/frameworks.md)).

1. **Install the packages**:
   ```sh
   pnpm add flags @flags-sdk/next @vercel/flags-core @openfeature/server-sdk
   ```
   `@openfeature/server-sdk` is a peer dependency of `VercelProvider`. Your code does not import it.
2. **Add the plugin**. `withFlags` returns a function of the phase, so it must be the outer plugin:
   ```ts
   // next.config.ts
   import { withFlags } from '@flags-sdk/next/plugin';

   export default withFlags({
     // Your Next.js configuration, as usual
   });
   ```
   With other plugins: `withFlags(withVercelToolbar()(nextConfig))`, never `withVercelToolbar()(withFlags(nextConfig))`. A phase function config: `withFlags((phase) => ({ ... }))`. Turbopack only.
3. **Link and pull credentials**: `vercel link` (if not linked), then `vercel env pull`. This writes the OIDC token to `.env.local`. `VercelProvider` and the catalog use it. Deployments on Vercel get the token automatically.
4. **The source `self`**: do not create `provider.ts` or `catalog.ts`. With `@vercel/flags-core` installed, the plugin uses `new VercelProvider()` and `@vercel/flags-core/catalog` by default. Add only `flags/sources/self/context.ts` (SvelteKit: `src/flags/sources/self/context.ts`) when targeting rules use entities. Return the entity and attribute names that the dashboard defines under Flags → Entities:
   ```ts
   // flags/sources/self/context.ts
   import type { FlagsRequest } from 'flags';

   export default function getEvaluationContext(
     request: FlagsRequest | undefined,
   ) {
     return {
       user: { id: request?.cookies?.get('user-id')?.value ?? 'anonymous' },
     };
   }
   ```
   Restart the dev server after you add `context.ts`. Add `provider.ts` only to configure the client (e.g. `new VercelProvider(createClient({ ... }))`), and `catalog.ts` only for options or a static catalog with `defaultValue`.
5. **Generate the code**: start the dev server, or run `npx flags sync`. Check that `.flags/self.ts` and `flags/generated.d.ts` (or `src/flags/generated.d.ts`) exist. If the SDK warns `The default source "self" has no flags, because the flags of Vercel Flags could not be loaded`, the credentials are missing: run `vercel link` and `vercel env pull`.
6. **Flags Explorer** (Next.js): add the manifest route. The plugins of the other frameworks serve the manifest without a route.
   ```ts
   // app/.well-known/flags/manifest.json/route.ts
   export { GET } from '@flags-sdk/next/manifest';
   ```
   For local development, add the Vercel Toolbar: `pnpm add @vercel/toolbar`, wrap the config as `withFlags(withVercelToolbar()(nextConfig))` (`import { withVercelToolbar } from '@vercel/toolbar/plugins/next'`), and render `{process.env.NODE_ENV === 'development' && <VercelToolbar />}` (`import { VercelToolbar } from '@vercel/toolbar/next'`) in the root layout.
7. **Verify**: run the type check (`flags sync && tsc --noEmit`) and the build.

Details of the Vercel provider, the catalog, SDK keys and other projects: [references/providers.md](references/providers.md#vercel-flags).

## Create a flag

Use this flow when the flag does not exist on Vercel yet. If it exists (the prompt says so, or `vercel flags create` reports that the key exists), follow [Add a flag that exists on Vercel](#add-a-flag-that-exists-on-vercel).

1. **Set up the SDK** if needed ([Set up the SDK with Vercel Flags](#set-up-the-sdk-with-vercel-flags)).
2. **Create the flag on Vercel**: `vercel flags create <key> --kind boolean --description "<description>"` against the linked project, or with `--project <name-or-id> --scope <team>`. Pick the kind to match the type of the flag (`boolean`, `string`, `number`, `json`). The kind cannot be changed later. Run `vercel flags create --help` for the variants of other kinds.
3. **Pull the credentials** if `.env.local` has no `VERCEL_OIDC_TOKEN=`: `vercel env pull`.
4. **Generate the code**:
   - File system API: a running dev server picks up the new flag. Otherwise run `npx flags sync`. Check that `flags/generated.d.ts` (or `src/flags/generated.d.ts`) declares the key.
   - Hand-written source: add a `bindFlag` to the `'use flags'` module:
     ```ts
     export const myFlag = bindFlag({
       key: 'my-flag',
       source: self,
       defaultValue: false,
       description: 'What the flag is for',
     });
     ```
5. **Use the flag** on the server. A generated module exports each flag under its key. Import a key that is not a valid name with a string import:
   ```tsx
   import { 'my-flag' as myFlag } from 'flags:self';

   export default async function Page() {
     const enabled = await myFlag();
     return <div>{enabled ? 'Feature on' : 'Feature off'}</div>;
   }
   ```
6. **Plan the failure case.** The Vercel catalog gives no `defaultValue`, so a generated flag throws a `FlagEvaluationError` when its evaluation fails. Where a safe value exists, catch the error at the call site, or declare the flag by hand with `defaultValue`, or use a static catalog ([references/code-generation.md](references/code-generation.md#default-values)).
7. **Verify**: type check and build. Then use the `vercel-flags` skill to enable, roll out or split the flag.

## Add a flag that exists on Vercel

Use this flow when the flag was created in the dashboard or by someone else. Do not run `vercel flags create` for an existing key.

1. **Set up the SDK** if needed.
2. **Read the definition**: `vercel flags inspect <key>`. Note the kind, the variants, the description, and what each environment serves.
3. **Pull the credentials** if `.env.local` has no `VERCEL_OIDC_TOKEN=`.
4. **Get the flag into code**:
   - File system API: the catalog already generates it. Run `npx flags sync` (or let the dev server do it), and import the flag from `flags:self`. Its type and options come from the variants.
   - Hand-written: map the `inspect` output to `bindFlag`:
     - `key`: the key exactly as printed.
     - kind → `type`: `boolean` → no `type` (or `'boolean'`), `string` → `'string'`, `number` → `'number'`, `json` → `'object'`.
     - `options`: the variants, when you use precompute or want them in Flags Explorer.
     - `description`: copy it.
     - `defaultValue`: the value for a failed evaluation or an archived flag, usually what production serves today.
     ```ts
     export const welcomeMessage = bindFlag({
       key: 'welcome-message',
       source: self,
       type: 'string',
       description: 'Copy shown on the landing page',
       defaultValue: 'control',
     });
     ```
5. **Targeting**: if the flag has rules, splits or rollouts, check that `context.ts` (or `getEvaluationContext` of the source) returns the entities and attributes that the rules use, e.g. `user.id` for `--by user.id`.
6. **Use the flag** as in [Create a flag](#create-a-flag), step 5.

What a flag serves (enable, set, split, rollout, rules) changes in the dashboard or with `vercel flags`, not in code. The `vercel-flags` skill covers these flows.

## Inline flags

```ts
// flags.ts
'use flags';

import { defineFlag } from 'flags';

export const betaBanner = defineFlag({
  key: 'beta-banner',
  decide: (request) => request?.cookies?.get('beta')?.value === '1',
  options: [false, true] as const,
  description: 'Shows the beta banner to testers',
});
```

A typed second parameter of `decide` makes the context required at each call: `decide: async (_request, context: { teamId: string }) => ...` and `await teamInsights({ evaluationContext: { teamId } })`. To move an inline flag to a provider, replace `defineFlag` with `bindFlag` (or the generated flag) and keep the key. The call sites do not change.

## Evaluate flags

```ts
import { evaluate } from 'flags';
import { enableSale } from 'flags:self';
import { betaBanner } from './flags';

const sale = await enableSale();
const [sale2, beta] = await evaluate([enableSale, betaBanner]);
const insights = await teamInsights({ evaluationContext: { teamId } });
```

- Flags run only on the server: server components, route handlers, loaders, server functions, middleware and scripts. Pass values to the client as props or loader data.
- Never import `flags` or `flags:<source>` in client code (`'use client'`, universal `+page.ts`, browser components).
- In the Next.js proxy, wrap the call: `await runtime.onInvoke(request, () => betaBanner())`.
- A key that is known only at runtime: ``evaluate({ key: `feature-${name}`, source: self })``. Define known flags with `bindFlag`, so they have types and appear in the manifest.

## Overrides and `FLAGS_SECRET`

Flags Explorer overrides a flag for one browser with the cookie `flag-overrides`. The SDK also reads the v4 cookie `vercel-flag-overrides`. It accepts only trusted tokens:

- **Signed by Vercel**: on Vercel, and locally after `vercel link` and `vercel env pull`. No secret is needed. This also works when `FLAGS_SECRET` is set.
- **Encrypted with `FLAGS_SECRET`**: the v4 format, for tests, CI, `vercel flags override`, and apps outside Vercel.

`FLAGS_SECRET` is optional on Vercel. Set it when the app runs outside Vercel, when tests create tokens with `encryptOverrides`, or when you use `vercel flags override`. Without it, `FlagValues` encrypts the flag values with a public key of Vercel, and only Vercel can decrypt them; with it, `FlagValues` uses the v4 format with this secret. It is 32 random bytes as base64url. Standard base64 also works.

Rules for secrets:

- Preserve existing values. Do not rotate them as part of SDK setup.
- A missing local value does not mean the remote value is missing. Check the target environment first, then run `vercel env pull` for Development. Activating Vercel Flags creates a `FLAGS_SECRET` for each environment.
- Generate a secret only for an environment that has none. Use a distinct value per environment. Mark Preview and Production values as Sensitive.
- Send generated values directly to storage, e.g. through stdin to `vercel env add`. Do not print secrets or tokens to the terminal, logs or chat, and do not put them into command arguments.

Hooks see overrides with the reason `OVERRIDE` (`OVERRIDE_REASON`). Testing with overrides (`encryptOverrides`, `signOverrides`): [references/testing.md](references/testing.md). Cookie rules and `overrides` options: [references/api.md](references/api.md#overrides).

## Precompute (Next.js)

Precompute keeps pages static while flags vary per visitor. The proxy calls `precompute(group, { request })`, rewrites to `/<code>/path`, and the page reads values with `getPrecomputed(flag, group, code)`. All from `@flags-sdk/next/precompute`. `withFlags` injects a secret per build, so `FLAGS_PRECOMPUTE_SECRET` is optional. Set it when codes must stay valid across deployments. Put the group array into a module without `'use flags'`. See [references/precompute.md](references/precompute.md).

## Common pitfalls

- **`withFlags` is not the outer plugin.** It returns a phase function. `withVercelToolbar()(withFlags({}))` breaks. Use `withFlags(withVercelToolbar()({}))`. If another plugin must be outer, use `withFlags(config, { disableCodeGeneration: true })` and run `flags sync` before `next dev` and `next build`.
- **Hand-written sources with `@vercel/flags-core`.** An app that depends on `@vercel/flags-core` gets the default source `flags:self` and the network requests of its catalog, also when it writes its sources by hand. Set `"selfSource": false` in `flags/config.json`. The plugins, `flags sync` and `flags watch` read this file. There is no plugin option and no CLI flag for it.
- **Creating `provider.ts` and `catalog.ts` for Vercel Flags.** Not needed with `@vercel/flags-core`: the default source `self` has them. Add a file only to replace its part. Each other source still needs both files.
- **An empty `flags:self` in CI.** Without credentials, the default catalog gives no flags and the SDK warns; the build does not fail, but the type check fails at the import of a flag. Pull the credentials (or set `FLAGS`), commit `flags/generated.d.ts`, or set `"selfSource": false` in `flags/config.json`. A custom `catalog.ts` fails the build instead.
- **Webpack in Next.js.** `withFlags` supports Turbopack only. A webpack build throws.
- **No source on `bindFlag`.** The runtime has no default source. `bindFlag` without `source` throws. The configuration files have no source option.
- **No `flags/config.ts` and no `defineConfig`.** They do not exist. Put the hooks for all flags into the default export of `flags/hooks.ts`, the override options into the default export of `flags/overrides.ts`, and the static settings into `flags/config.json`. The SDK checks `flags/config.json` strictly: an unknown key or a wrong type is an error.
- **Missing `type`.** A non-boolean flag without `type` is a type error, and a string value fails at runtime with `TYPE_MISMATCH`.
- **Other exports in a `'use flags'` module.** Each export must be a flag. Export sources, helpers, types and precompute groups from other modules. An export that is not a flag makes the manifest fail.
- **Side effects in a `'use flags'` module or `provider.ts`.** Tools import these modules to read the flags, e.g. when a build writes the manifest. Do not open connections at import. Some providers connect when you create them (LaunchDarkly, Split, CloudBees), and some throw without a key (the Flagsmith client): keep them in one module of their own, or create them lazily on `initialize()`. See [references/providers.md](references/providers.md#providers-that-connect-at-import).
- **App code in `catalog.ts`.** The catalog runs in plain Node.js at build and dev time, not in the app. Do not import app code, path aliases (`@/...`) or framework modules. Use packages and relative imports of the files of the source. `context.ts` and `provider.ts` run in the app, so they may import app code, e.g. the session.
- **A flag inside `'use cache'`.** It throws `FlagInCacheError`, also with a `defaultValue`. Evaluate the flag outside the cached function, and pass the value in as an argument.
- **Expecting `request` everywhere.** At build time, in prerendered pages and in scripts, `request` is `undefined`. Always write `request?.cookies?.get(...)`. Next.js server components give no URL, so `request.url` is `undefined` there.
- **Runtime.** Flags run in the Node.js runtime, which is the default in Next.js, also in `proxy.ts`. The Edge runtime is not tested.
- **Restart after source changes.** Restart the dev server after you add or remove a source, or add, remove or change `provider.ts`, `catalog.ts` or `context.ts`.
- **Generated types in CI.** `flags/generated.d.ts` must exist before `tsc`. Commit it, or run `flags sync && tsc --noEmit`.
- **Registering the provider with OpenFeature too.** Do not call `OpenFeature.setProvider()` with an instance that a source uses. It would be initialized and closed twice.
- **Reflag.** Its OpenFeature provider cannot be bundled. Stay on v4 for Reflag.

## References

- [references/api.md](references/api.md): every export of `flags`, `flags/tooling`, `flags/manifest`, and of each framework package, with signatures.
- [references/frameworks.md](references/frameworks.md): setup of Next.js, SvelteKit, Nuxt, TanStack Start, Hono, Express, plain Node.js, and custom frameworks.
- [references/code-generation.md](references/code-generation.md): the source folder, catalogs (static and streaming), what the generator writes, the CLI, default values.
- [references/providers.md](references/providers.md): Vercel Flags in depth (SDK keys, other projects, Project Connections, targeting, attribute types), every OpenFeature provider, custom providers.
- [references/precompute.md](references/precompute.md): precompute in Next.js.
- [references/testing.md](references/testing.md): mocks, in-memory providers, simulated requests, end-to-end tests with overrides.
- [references/upgrading-from-v4.md](references/upgrading-from-v4.md): the mapping from v4 to v5, step by step.
