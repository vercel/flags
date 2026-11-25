---
name: flags-sdk
description: >
  Write feature flag code with the Flags SDK v5 (the `flags` npm package) and Vercel Flags.
  Use when installing or configuring the SDK, adding a flag to code, or changing flag code:
  flags files (`app.flags`, `*.flags`) and `import { ... } from 'flags:<source>'`, `defineFlag`,
  `defineSource` and `source.bindFlag`, `flags/sources/<source>/provider.ts`, `context.ts`,
  `hooks.ts`, `"selfSource"` in `flags/config.json`, `flags sync`, `flags watch`, `flags format`,
  `'use flags'` modules, `evaluate`, `flags/hooks.ts`, the framework packages (`withFlags` of
  `@flags-sdk/next/plugin`, SvelteKit, Nuxt, TanStack Start, Hono, Express, Vite), precompute,
  `FlagValues`, Flags Explorer, overrides, `FLAGS_SECRET`, OpenFeature providers (`VercelProvider`
  of `@vercel/flags-core/openfeature`, LaunchDarkly, Statsig, PostHog, custom), and
  upgrading from v4 (`flag()`, adapters, `identify`, `dedupe`). For planning a flag, the
  `vercel flags` CLI beyond create and inspect, rollouts, experiments, cleanup, use the
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
  - A **provider flag**, `source.bindFlag(key, options?)`, asks the OpenFeature provider of its source.
- **A source** is `defineSource({ provider, project?, getEvaluationContext?, hooks? })`. Each provider flag is declared on its source. The runtime has no default source. By convention, the main source of an app is `self`. With `@vercel/flags-core` in `package.json`, the source `self` of the flags files uses Vercel Flags by default (see below).
- **The evaluation context** comes from a chain: call side (`flag({ evaluationContext })`) → flag (`getEvaluationContext` of `source.bindFlag`) → source (`getEvaluationContext(request, input)`) → provider. Each step is optional and runs once per request and input. This replaces `identify` and `dedupe` of v4. The SDK does not merge the steps: each step returns the complete input of the next one.
- **Types.** Without `type`, a flag is a boolean. Set `type: 'string' | 'number' | 'object'` for every other flag. The SDK does not infer the type from `defaultValue` or `options`. `object` is any JSON value.
- **`options`** list the known values, for Flags Explorer and precompute. They do not limit the value: a new variant goes through.
- **`defaultValue`** is returned when the evaluation fails, and the SDK logs one line. Without it, the call throws a `FlagEvaluationError`.
- **One value per request.** Each flag is evaluated once per request and context. Call flags directly: `await summerSale()`. Calls of many flags in parallel share the work (one evaluation context per request, one provider call per flag). `evaluate([a, b, c])` gives no speed advantage. Use it only as a convenience for a list of flags.
- **`'use flags'` modules.** A module that starts with `'use flags'` exports only flags. The framework plugins register these flags, and the flags manifest for Flags Explorer lists them. Flags files and the generated modules need no directive.
- **The runtime** (`runtime` of `flags/runtime`) knows the current request, initializes each provider once, and closes it at shutdown. The framework package connects it to the request. Without a framework, call `runtime.onInvoke(request, next)` yourself.
- **App code imports only `flags`** (and `flags:<source>`). The framework packages are only for the setup, plus precompute and `FlagValues` in Next.js.

## Decide the setup

**Flags files** (recommended for Next.js, SvelteKit, Nuxt, TanStack Start, and also for Hono, Express and Node.js with `node --import flags/register`). Declare each flag in `app.flags` (SvelteKit: `src/app.flags`), and import it from the file or from its source:

```js
// app.flags
flag enableSale {
  description: "Shows the summer sale banner"
  defaultValue: false
}
```

```ts
import { enableSale } from './app.flags'; // or from 'flags:self'
```

The flags files declare the flags (name, key, type, options, description, default value). Vercel Flags stays the source of truth of the values. Builds and type checks use no network and no credentials. The plugin compiles the flags files, writes `.flags/<source>.ts` and the types (`flags/generated.d.ts`, `app.d.flags.ts`), and resolves `flags:<source>`. With `@vercel/flags-core` in any dependency field of `package.json`, the source `self` needs no folder: its provider is `new VercelProvider()`. Each file in `flags/sources/self/` replaces or adds only its part, e.g. `context.ts` adds the evaluation context. Every other source, and `self` without `@vercel/flags-core`, needs `flags/sources/<source>/provider.ts`:

```txt
app.flags                 # the flags of the source self (SvelteKit: src/app.flags)
app.d.flags.ts            # generated types, add *.d.flags.ts to .gitignore
flags/                    # in the app root or in src/ (SvelteKit: always src/flags)
  config.json             # optional: static settings, e.g. { "selfSource": false } or "overrides"
  hooks.ts                # optional: default export: the hooks for all flags (Hook[])
  sources/
    self/
      provider.ts         # default export: an OpenFeature provider (optional for the default source self)
      context.ts          # optional: default export getEvaluationContext(request, input)
      hooks.ts            # optional: default export: the hooks of this source (Hook[])
  generated.d.ts          # generated types of flags:<source>, commit it or run `flags sync` before tsc
.flags/                   # generated modules, ignored by its own .gitignore
```

Set `"allowArbitraryExtensions": true` in `tsconfig.json` for the `*.d.flags.ts` files. See [references/flags-files.md](references/flags-files.md).

**Hand-written sources** (Hono, Express, plain Node.js, or when the user prefers code): write `defineSource` in one module (e.g. `flags/self.ts`) and the `self.bindFlag(key)` calls in a `'use flags'` module (e.g. `flags.ts`). A flags file compiles to the same code, so the call sites do not change when you switch. In a framework with a plugin and `@vercel/flags-core`, also set `"selfSource": false` in `flags/config.json`.

Inline flags (`defineFlag`) go into a hand-written `'use flags'` module in both setups.

| Framework      | Package                     | Setup                                                    |
| -------------- | --------------------------- | -------------------------------------------------------- |
| Next.js        | `@flags-sdk/next`           | `export default withFlags({...})` in `next.config.ts`    |
| SvelteKit      | `@flags-sdk/sveltekit`      | `flags()` of `@flags-sdk/sveltekit/vite` in `vite.config.ts` |
| Nuxt           | `@flags-sdk/nuxt`           | `modules: ['@flags-sdk/nuxt']` in `nuxt.config.ts`       |
| TanStack Start | `@flags-sdk/tanstack-start` | `flags()` of `@flags-sdk/tanstack-start/vite` in `vite.config.ts` |
| Hono           | `@flags-sdk/hono`           | `app.use(flags())`, `node --import flags/register`       |
| Express        | `@flags-sdk/express`        | `app.use(flags())`, `node --import flags/register`       |
| No framework   | none                        | `runtime.onInvoke(request, next)` per request            |
| Other Vite app | `@flags-sdk/vite`           | `flags()` Vite plugin (for framework packages)           |

Precompute exists for Next.js only. See [references/frameworks.md](references/frameworks.md) for the full setup of each framework.

## Before you start

Check the project, and skip the steps that are done:

- **Package manager**: use the lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lock`/`bun.lockb`) to pick `pnpm add`, `npm install`, `yarn add` or `bun add`.
- **SDK version**: is `flags` in `package.json`, and which major? Code with `flag()` from `flags/next` or `flags/sveltekit`, `@flags-sdk/vercel`, `identify`, `dedupe` or `app/.well-known/vercel/flags/route.ts` is v4. Do not mix v4 and v5 APIs. Ask the user before you upgrade, then follow [references/upgrading-from-v4.md](references/upgrading-from-v4.md).
- **Framework**: which framework, and does it have a bundler? This selects the package and the setup.
- **Flags and sources**: are there flags files (`*.flags`, e.g. `app.flags`)? Does `flags/sources/` (or `src/flags/sources/`) exist? Which sources? Is there a hand-written `defineSource`? Is `@vercel/flags-core` in `package.json` (then the source `self` uses `VercelProvider` by default, unless `flags/config.json` sets `"selfSource": false`)?
- **Vercel link**: run `vercel project inspect --non-interactive` and check the owner and project name. A `.vercel/` folder alone does not prove a link. If it reports `link_required`, run `vercel link`. If the user named a project or team and the output differs, stop and ask.
- **Credentials**: does `.env.local` contain `VERCEL_OIDC_TOKEN=` (or an SDK key in `FLAGS=`)? Do not print the values.
- **Flags Explorer**: in Next.js, does `app/.well-known/flags/manifest.json/route.ts` exist? Is `@vercel/toolbar` installed?

> **Prerequisite**: The Vercel CLI must be installed and authenticated. If it is not installed, run `pnpm i -g vercel`. For authentication or link problems, follow the `vercel-cli` skill if it is available. If it is not, suggest `npx skills add vercel/vercel@vercel-cli` (do not install it yourself), and use `vercel <command> --help` in the meantime.

## Set up the SDK with Vercel Flags

One-time setup. The example is Next.js; the other frameworks differ only in steps 1, 2 and 6 ([references/frameworks.md](references/frameworks.md)).

1. **Install the packages**:
   ```sh
   pnpm add flags @flags-sdk/next @vercel/flags-core
   ```
   `VercelProvider` does not need `@openfeature/server-sdk` at runtime, so you do not install it. With `"skipLibCheck": false` in `tsconfig.json`, install it as a dev dependency for its types.
2. **Add the plugin**. `withFlags` returns a function of the phase, so it must be the outer plugin:
   ```ts
   // next.config.ts
   import { withFlags } from '@flags-sdk/next/plugin';

   export default withFlags({
     // Your Next.js configuration, as usual
   });
   ```
   With other plugins: `withFlags(withVercelToolbar()(nextConfig))`, never `withVercelToolbar()(withFlags(nextConfig))`. A phase function config: `withFlags((phase) => ({ ... }))`. Turbopack only.
3. **Link and pull credentials**: `vercel link` (if not linked), then `vercel env pull`. This writes the OIDC token to `.env.local`. `VercelProvider` uses it at runtime. The build does not need it. Deployments on Vercel get the token automatically.
4. **The source `self`**: do not create `provider.ts`. With `@vercel/flags-core` installed, the source `self` uses `new VercelProvider()` by default. Add only `flags/sources/self/context.ts` (SvelteKit: `src/flags/sources/self/context.ts`) when targeting rules use entities. Return the entity and attribute names that the dashboard defines under Flags → Entities:
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
   Add `provider.ts` only to configure the client (e.g. `new VercelProvider(createClient({ ... }))`).
5. **Add the flags file**: create `app.flags` (SvelteKit: `src/app.flags`). An empty file is valid and gives `flags:self`. Set `"allowArbitraryExtensions": true` in `tsconfig.json`, and add `*.d.flags.ts` to `.gitignore`. Start the dev server, or run `npx flags sync`. Check that `.flags/self.ts` and `flags/generated.d.ts` (or `src/flags/generated.d.ts`) exist.
6. **Flags Explorer** (Next.js): add the manifest route. The plugins of the other frameworks serve the manifest without a route.
   ```ts
   // app/.well-known/flags/manifest.json/route.ts
   export { GET } from '@flags-sdk/next/manifest';
   ```
   For local development, add the Vercel Toolbar: `pnpm add @vercel/toolbar`, wrap the config as `withFlags(withVercelToolbar()(nextConfig))` (`import { withVercelToolbar } from '@vercel/toolbar/plugins/next'`), and render `{process.env.NODE_ENV === 'development' && <VercelToolbar />}` (`import { VercelToolbar } from '@vercel/toolbar/next'`) in the root layout.
7. **Verify**: run the type check (`flags sync && tsc --noEmit`) and the build.

Details of the Vercel provider, SDK keys and other projects: [references/providers.md](references/providers.md#vercel-flags).

## Create a flag

Use this flow when the flag does not exist on Vercel yet. If it exists (the prompt says so, or `vercel flags create` reports that the key exists), follow [Add a flag that exists on Vercel](#add-a-flag-that-exists-on-vercel).

1. **Set up the SDK** if needed ([Set up the SDK with Vercel Flags](#set-up-the-sdk-with-vercel-flags)).
2. **Create the flag on Vercel**: `vercel flags create <key> --kind boolean --description "<description>"` against the linked project, or with `--project <name-or-id> --scope <team>`. Pick the kind to match the type of the flag (`boolean`, `string`, `number`, `json`). The kind cannot be changed later. Run `vercel flags create --help` for the variants of other kinds.
3. **Declare the flag** in `app.flags` (or in another flags file of the source), with the key of step 2:
   ```js
   // app.flags
   flag myFlag {
     description: "What the flag is for"
     defaultValue: false
   }
   ```
   For a key that is not a JavaScript name, set it in `key`: `flag summerSale { key: "summer-sale" }`. For a hand-written source, add a `self.bindFlag` call to the `'use flags'` module instead:
   ```ts
   export const myFlag = self.bindFlag('myFlag', {
     defaultValue: false,
     description: 'What the flag is for',
   });
   ```
4. **Use the flag** on the server. Import it from its flags file or from `flags:self`:
   ```tsx
   import { myFlag } from 'flags:self'; // or from '../app.flags'

   export default async function Page() {
     const enabled = await myFlag();
     return <div>{enabled ? 'Feature on' : 'Feature off'}</div>;
   }
   ```
5. **Plan the failure case.** Give each flag a `defaultValue` where a safe value exists. Without it, the flag throws a `FlagEvaluationError` when its evaluation fails, e.g. before the flag exists in Vercel. See [references/flags-files.md](references/flags-files.md#default-values).
6. **Verify**: type check and build. Then use the `vercel-flags` skill to enable, roll out or split the flag.

## Add a flag that exists on Vercel

Use this flow when the flag was created in the dashboard or by someone else. Do not run `vercel flags create` for an existing key.

1. **Set up the SDK** if needed.
2. **Read the definition**: `vercel flags inspect <key>`. Note the kind, the variants, the description, and what each environment serves.
3. **Pull the credentials** for local evaluation if `.env.local` has no `VERCEL_OIDC_TOKEN=`: `vercel env pull`.
4. **Declare the flag in code**. Nothing downloads the flags of Vercel: map the `inspect` output to a `flag` block in `app.flags` (or to `source.bindFlag` for a hand-written source):
   - `key`: the key exactly as printed. If it is not a JavaScript name, use a camelCase name and set `key: "<key>"`.
   - kind → `type`: `boolean` → `"boolean"`, `string` → `"string"`, `number` → `"number"`, `json` → `"object"`. In a flags file, the type of `defaultValue` or of the options is enough.
   - `options`: the variants, when you use precompute or want them in Flags Explorer.
   - `description`: copy it.
   - `defaultValue`: the value for a failed evaluation or an archived flag, usually what production serves today.
   ```js
   // app.flags
   flag welcomeMessage {
     type: "string"
     description: "Copy shown on the landing page"
     options: ["control", "friendly"]
     defaultValue: "control"
   }
   ```
5. **Targeting**: if the flag has rules, splits or rollouts, check that `context.ts` (or `getEvaluationContext` of the source) returns the entities and attributes that the rules use, e.g. `user.id` for `--by user.id`.
6. **Use the flag** as in [Create a flag](#create-a-flag), step 4.

What a flag serves (enable, set, split, rollout, rules) changes in the dashboard or with `vercel flags`, not in code. The `vercel-flags` skill covers these flows.

## Inline flags

```ts
// flags.ts
'use flags';

import { defineFlag } from 'flags';

export const betaBanner = defineFlag({
  key: 'betaBanner',
  decide: (request) => request?.cookies?.get('beta')?.value === '1',
  options: [false, true] as const,
  description: 'Shows the beta banner to testers',
});
```

A typed second parameter of `decide` makes the context required at each call: `decide: async (_request, context: { teamId: string }) => ...` and `await teamInsights({ evaluationContext: { teamId } })`. To move an inline flag to a provider, replace `defineFlag` with a flag of a flags file (or `source.bindFlag`) and keep the key. The call sites do not change.

## Evaluate flags

```ts
import { evaluate } from 'flags';
import { enableSale } from 'flags:self';
import { betaBanner } from './flags';

const sale = await enableSale();
const beta = await betaBanner();
const insights = await teamInsights({ evaluationContext: { teamId } });

// A convenience for a list of flags, e.g. all flags of a page
const values = await evaluate([enableSale, betaBanner]); // [boolean, boolean]
```

- Flags run only on the server: server components, route handlers, loaders, server functions, middleware and scripts. Pass values to the client as props or loader data.
- Never import `flags` or `flags:<source>` in client code (`'use client'`, universal `+page.ts`, browser components).
- In the Next.js proxy, wrap the call: `await runtime.onInvoke(request, () => betaBanner())`.
- A key that is known only at runtime: ``evaluate({ key: `feature-${name}`, source: self })``. Define known flags with `source.bindFlag`, so they have types and appear in the manifest.

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
- **Expecting the flags of Vercel in `flags:self`.** The SDK does not download flags. `flags:self` has only the flags which the flags files declare. Declare each flag in a flags file, also a flag that exists in Vercel. Without any flags file of the source `self`, there is no `flags:self` and its import fails: create `app.flags` (it can be empty).
- **Creating `provider.ts` for Vercel Flags.** Not needed with `@vercel/flags-core`: the source `self` uses `new VercelProvider()` by default. Add a file only to replace or add its part. Each other source needs `provider.ts`. To turn off the default provider, set `"selfSource": false` in `flags/config.json`. There is no plugin option and no CLI flag for it.
- **A key or a name in two flags files of one source.** `flags sync` and the build fail. Declare each flag in one file.
- **Webpack in Next.js.** `withFlags` supports Turbopack only. A webpack build throws.
- **A standalone `bindFlag` or a `source` option.** They do not exist. Declare a provider flag on its source: `self.bindFlag('summerSale')`. The runtime has no default source, and the configuration files have no source option.
- **No `flags/config.ts` and no `defineConfig`.** They do not exist. Put the hooks for all flags into the default export of `flags/hooks.ts`, and the static settings, also the override options (`"overrides"`), into `flags/config.json`. There is no code file for the override options. The secret comes only from `FLAGS_SECRET`. The SDK checks `flags/config.json` strictly: an unknown key or a wrong type is an error.
- **Missing `type`.** A non-boolean flag without `type` is a type error, and a string value fails at runtime with `TYPE_MISMATCH`.
- **Other exports in a `'use flags'` module.** Each export must be a flag. Export sources, helpers, types and precompute groups from other modules. An export that is not a flag makes the manifest fail.
- **Side effects in a `'use flags'` module or `provider.ts`.** Tools import these modules to read the flags, e.g. when a build writes the manifest. Do not open connections at import. Some providers connect when you create them (LaunchDarkly, Split, CloudBees), and some throw without a key (the Flagsmith client): keep them in one module of their own, or create them lazily on `initialize()`. See [references/providers.md](references/providers.md#providers-that-connect-at-import).
- **Code in a flags file.** A flags file has only plain values. Nothing in it runs. Put logic into `context.ts` of the source, or into an inline flag.
- **A flag inside `'use cache'`.** It throws `FlagInCacheError`, also with a `defaultValue`. Evaluate the flag outside the cached function, and pass the value in as an argument.
- **Expecting `request` everywhere.** At build time, in prerendered pages and in scripts, `request` is `undefined`. Always write `request?.cookies?.get(...)`. Next.js server components give no URL, so `request.url` is `undefined` there.
- **Runtime.** Flags run in the Node.js runtime, which is the default in Next.js, also in `proxy.ts`. The Edge runtime is not tested.
- **Restart after a new source.** Restart the dev server after you add a flags file with a new source, because its alias `flags:<source>` is new.
- **Generated types in CI.** `flags/generated.d.ts` and the `*.d.flags.ts` files must exist before `tsc`. Run `flags sync && tsc --noEmit`. `flags sync` needs no credentials.
- **Registering the provider with OpenFeature too.** Do not call `OpenFeature.setProvider()` with an instance that a source uses. It would be initialized and closed twice.
- **Reflag.** Its OpenFeature provider cannot be bundled. Stay on v4 for Reflag.

## References

- [references/api.md](references/api.md): every export of `flags`, `flags/tooling`, `flags/manifest`, and of each framework package, with signatures.
- [references/frameworks.md](references/frameworks.md): setup of Next.js, SvelteKit, Nuxt, TanStack Start, Hono, Express, plain Node.js, and custom frameworks.
- [references/flags-files.md](references/flags-files.md): the format of flags files, `flags:<source>`, the source folder, the default source `self`, the code generation, TypeScript, the CLI, default values.
- [references/providers.md](references/providers.md): Vercel Flags in depth (SDK keys, other projects, Project Connections, targeting, attribute types), every OpenFeature provider, custom providers.
- [references/precompute.md](references/precompute.md): precompute in Next.js.
- [references/testing.md](references/testing.md): mocks, in-memory providers, simulated requests, end-to-end tests with overrides.
- [references/upgrading-from-v4.md](references/upgrading-from-v4.md): the mapping from v4 to v5, step by step.
