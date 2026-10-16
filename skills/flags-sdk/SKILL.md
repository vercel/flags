---
name: flags-sdk
description: >
  Implement feature flags in Next.js or SvelteKit code with the Flags SDK (`flags` npm package).
  Use when installing or configuring the SDK, declaring flags with `flag()`, wiring a provider
  adapter (`@flags-sdk/vercel`, Statsig, LaunchDarkly, PostHog, GrowthBook, Global Config,
  OpenFeature, Split, Flagsmith, Reflag, Optimizely, or custom), using `identify`, `dedupe`, or
  `evaluate`, keeping pages static with precompute, setting up Flags Explorer and the Vercel
  Toolbar, or encrypting flag values. Triggers: `flags/next`, `flags/sveltekit`, `flags/react`,
  `@flags-sdk/*`, `vercelAdapter`, precompute. For planning a flag, for Vercel Flags rollouts,
  experiments, and the `vercel flags` CLI, or for other frameworks, use the `vercel-flags` skill.
---

# Set up and use the Flags SDK

The Flags SDK (`flags` npm package) is a feature flags toolkit for Next.js and SvelteKit. It turns each feature flag into a callable function, works with any flag provider via adapters, and keeps pages static using the precompute pattern. Vercel Flags is the first-party provider; its adapter is `@flags-sdk/vercel`.

- Docs: https://flags-sdk.dev
- Repo: https://github.com/vercel/flags

This skill covers the code. Planning a flag, choosing between the Flags SDK, `@vercel/flags-core`, and OpenFeature, and managing flags in the dashboard or with the `vercel flags` CLI belong to the `vercel-flags` skill. Archiving a flag, deleting it, or removing a variant requires the checks in that skill (remove the code first, confirm no evaluations over the Skew Protection window, archive before `rm`); do not run those commands without it. If it is not available, suggest `npx skills add vercel/flags@vercel-flags` (do not auto-install) and run `vercel flags <cmd> --help` in the meantime. For a project on another framework, `@vercel/flags-core` replaces this SDK ([Core SDK](https://vercel.com/docs/flags/vercel-flags/sdks/core)).

When the user asks to install, configure, or set up the SDK, follow [Set up the SDK](#set-up-the-sdk) (including `vercel env pull` when `.env.local` is missing). When they ask to add a flag to the code, follow [Create a flag](#create-a-flag) or [Add a flag that already exists on Vercel](#add-a-flag-that-already-exists-on-vercel). Inside an app repository, treat an ambiguous request as the full flow. Do not leave CLI steps as "next steps" for the user; execute them yourself.

## Core concepts

### Flags as code

Each flag is declared as a function. No string keys at call sites:

```ts
import { flag } from 'flags/next';

export const exampleFlag = flag({
  key: 'example-flag',
  decide() { return false; },
});

const value = await exampleFlag();
```

### Server-side evaluation

Flags evaluate server-side to avoid layout shift, keep pages static, and maintain confidentiality. Combine routing middleware with the precompute pattern to serve static variants from CDN.

### Adapter pattern

Adapters replace `decide` and `origin` on a flag declaration, connecting your flags to a provider. Vercel Flags (`@flags-sdk/vercel`) is the first-party adapter. Third-party adapters are available for Statsig, LaunchDarkly, PostHog, and others.

```ts
import { flag } from 'flags/next';
import { vercelAdapter } from '@flags-sdk/vercel';

export const exampleFlag = flag({
  key: 'example-flag',
  adapter: vercelAdapter,
});
```

> **Version note**: The SDK is published as `flags` (renamed from `@vercel/flags`; that old name still appears in changelog history). `flags` 4.2.0+ accepts the adapter factory by reference (`adapter: vercelAdapter`) and resolves it once per declaration. Older versions require calling it (`adapter: vercelAdapter()`). The called form still works on new versions, so prefer the shorthand unless you're targeting `flags` < 4.2.0.

## Set up the SDK

One-time project setup. Run this when the Flags SDK is not installed yet, or when Toolbar / Flags Explorer / `.env.local` are missing. Skip any step that is already done.

### Before you start

Check the project state to adapt commands and decide which steps you can skip:

- Which lockfile is present (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`)? → Adapt all package manager commands accordingly (`pnpm add`, `npm install`, `yarn add`, `bun add`).
- Is `flags` in `package.json`? → Skip install (step 1)
- Is the project linked? → Skip `vercel link` in step 2
- Does `.env.local` contain `VERCEL_OIDC_TOKEN=` (or a `FLAGS=` SDK key)? → Env vars already pulled, skip step 3
- Is `@vercel/toolbar` in `package.json`? → Skip toolbar setup (step 4)
- Does `flags.ts` (or `lib/flags.ts`, `src/flags.ts`) exist? → Skip creating it (step 5)
- Does `app/.well-known/vercel/flags/route.ts` exist? → Flags Explorer already set up, skip step 6

### Steps

1. **Install packages** (if not already in `package.json`):
   ```bash
   pnpm i flags @flags-sdk/vercel
   ```

2. **Link the project to Vercel** (required for `vercel env pull` and local OIDC token refresh):
   > **Prerequisite**: The Vercel CLI must be installed and authenticated. If it is not installed, run `pnpm i -g vercel`. For authentication or linking issues, follow the `vercel-cli` skill if it's already available. If it isn't, suggest the user install it with `npx skills add vercel/vercel@vercel-cli` (don't auto-install it) and rely on `vercel <command> --help` in the meantime.

   Verify the link with `vercel project inspect --non-interactive` and check the reported owner and project name; a `.vercel/` directory alone does not prove a link. If it reports `link_required`, run `vercel link`. If the user named a project or team and the output differs, stop and ask instead of relinking.

3. **Pull environment variables**: If `.env.local` lacks `VERCEL_OIDC_TOKEN=`, follow [Pull environment variables](#pull-environment-variables).

4. **Set up the Vercel Toolbar** (if not already present):
   - Run `pnpm i @vercel/toolbar`
   - Wrap `next.config.ts` with the toolbar plugin
   - Render `<VercelToolbar />` in the root layout
   See [references/nextjs.md — Toolbar Setup](references/nextjs.md#toolbar-setup) for the full code.

5. **Ensure `flags.ts` exists**: If missing, create `flags.ts` (or `lib/flags.ts` / `src/flags.ts` to match the project) with `export {}` so TypeScript treats it as a module. Flags Explorer imports this file — create it before the discovery route.

6. **Set up Flags Explorer** (if not already present): Create `app/.well-known/vercel/flags/route.ts` — see [Flags Explorer setup](#flags-explorer-setup). Do this only after `flags.ts` exists. Point the import at the real flags file path (the snippet assumes root `flags.ts`).

## Pull environment variables

`vercel env pull` writes the Development credentials to `.env.local`: the Vercel OIDC token that `vercelAdapter` uses locally (deployments receive it automatically, [Getting started](https://vercel.com/docs/flags/vercel-flags/quickstart#pull-local-openid-connect-credentials)) and the Development `FLAGS_SECRET` for Flags Explorer and overrides. Run it when:

- `.env.local` lacks `VERCEL_OIDC_TOKEN=` (or a `FLAGS=` SDK key)
- you created the project's first flag; activating Vercel Flags creates a `FLAGS_SECRET` per environment
- local evaluation fails with an authentication error; the SDK refreshes an expired token through the linked project, re-pulling is the fallback

SDK keys (`FLAGS`) are only for apps outside Vercel, custom environments, or flags of another project ([SDK Keys](https://vercel.com/docs/flags/vercel-flags/dashboard/sdk-keys)). If `FLAGS_SECRET` is still missing after the pull, generate it per [FLAGS_SECRET](#flags_secret).

## Create a flag

When a user asks you to create or add a feature flag that does not exist on Vercel yet, follow these steps in order. If the flag was already created in the dashboard (the prompt says so, or `vercel flags create` reports the key exists), follow [Add a flag that already exists on Vercel](#add-a-flag-that-already-exists-on-vercel) instead.

### Before you start

- Complete [Set up the SDK](#set-up-the-sdk) first if packages, Vercel link, `.env.local`, Toolbar, `flags.ts`, or Flags Explorer are missing. Skip steps that are already done.
- Does `.env.local` contain `VERCEL_OIDC_TOKEN=`? → Env vars already pulled; see [Pull environment variables](#pull-environment-variables) if local evaluation fails with an authentication error.
- Does `flags.ts` (or `lib/flags.ts`, `src/flags.ts`) exist? → Add to it rather than creating from scratch.

### Steps

1. **Ensure the SDK is set up**: Follow [Set up the SDK](#set-up-the-sdk) if needed, then continue.

2. **Register the flag with Vercel**: Run `vercel flags create <flag-key> --kind boolean --description "<description>"` against the linked project, or pass `--project <name-or-id>` and `--scope <team>`. Pick the kind to match the flag's type parameter; it cannot be changed later.

3. **Pull environment variables**: If this is the project's first flag, follow [Pull environment variables](#pull-environment-variables) again; activation created the `FLAGS_SECRET`.

4. **Declare the flag in code**: Add it to `flags.ts` (or create the file if it doesn't exist) using `vercelAdapter`:
   ```ts
   import { flag } from 'flags/next';
   import { vercelAdapter } from '@flags-sdk/vercel';

   export const myFlag = flag({
     key: 'my-flag',
     adapter: vercelAdapter,
   });
   ```

5. **Use the flag**: Call it in your page or component and conditionally render based on the result:
   ```tsx
   import { myFlag } from '../flags';

   export default async function Page() {
     const enabled = await myFlag();
     return <div>{enabled ? 'Feature on' : 'Feature off'}</div>;
   }
   ```

## Add a flag that already exists on Vercel

Use this flow when the flag was created in the dashboard or by someone else, for example when the prompt says the flag "has already been created" or asks you to run `vercel flags inspect`. Do not run `vercel flags create` for an existing key.

1. **Ensure the SDK is set up**: Follow [Set up the SDK](#set-up-the-sdk) if needed.
2. **Read the definition**: Run `vercel flags inspect <flag-key>`. Note the kind, the variants (value and label), the description, and what each environment serves.
3. **Pull environment variables**: If `.env.local` lacks `VERCEL_OIDC_TOKEN=`, follow [Pull environment variables](#pull-environment-variables).
4. **Declare the flag**: Add it to `flags.ts` with `vercelAdapter`. Map the `inspect` output:
   - `key`: the flag key exactly as printed
   - kind → type parameter: `boolean` → `flag<boolean>`, `string` → `flag<string>`, `number` → `flag<number>`, `json` → `flag<YourType>`
   - `description`: copy from `inspect`
   - `defaultValue`: the value to serve when the flag is archived or evaluation fails (usually what production serves today)
   - `options`: optional; mirror the variants when you use precompute or want them listed in Flags Explorer
   - `identify`: add or reuse one when the flag has targeting, using the entity attributes configured in the dashboard (see [Flag with evaluation context](#flag-with-evaluation-context))
   ```ts
   export const welcomeMessage = flag<string>({
     key: 'welcome-message',
     description: 'Copy shown on the landing page',
     defaultValue: 'control',
     adapter: vercelAdapter,
   });
   ```
5. **Use the flag** as in [Create a flag](#create-a-flag) step 5.

## Vercel Flags adapter

`@flags-sdk/vercel` connects `flag()` declarations to Vercel Flags. `vercelAdapter` authenticates with the project's Vercel OIDC token and evaluates the configuration of the current environment; SDK keys (`FLAGS`) are for manual authentication only: apps outside Vercel, custom environments, or flags of another project ([SDK Keys](https://vercel.com/docs/flags/vercel-flags/dashboard/sdk-keys)). Activating Vercel Flags creates a `FLAGS_SECRET` per environment for Flags Explorer.

For user targeting, attribute types, custom adapter configuration, sharing a `@vercel/flags-core` client, and the Flags Explorer endpoint, see [references/providers.md — Vercel](references/providers.md#vercel).

Changing what a flag serves (enable, set, split, rollout, rules, archive) happens in the dashboard or with `vercel flags`, not in code. The `vercel-flags` skill covers those flows; `vercel flags <cmd> --help` lists the options.

## Declaring flags

When using Vercel Flags, declare flags with `vercelAdapter` as shown in [Create a flag](#create-a-flag). For other providers, see [references/providers.md](references/providers.md). Below are the general `flag()` patterns.

### Basic flag

```ts
import { flag } from 'flags/next'; // or 'flags/sveltekit'

export const showBanner = flag<boolean>({
  key: 'show-banner',
  description: 'Show promotional banner',
  defaultValue: false,
  options: [
    { value: false, label: 'Hide' },
    { value: true, label: 'Show' },
  ],
  decide() { return false; },
});
```

### Flag with evaluation context

Use `identify` to establish who the request is for. The returned entities are passed to `decide`:

```ts
import { dedupe, flag } from 'flags/next';
import type { ReadonlyRequestCookies } from 'flags';

interface Entities {
  user?: { id: string };
}

const identify = dedupe(
  ({ cookies }: { cookies: ReadonlyRequestCookies }): Entities => {
    const userId = cookies.get('user-id')?.value;
    return { user: userId ? { id: userId } : undefined };
  },
);

export const dashboardFlag = flag<boolean, Entities>({
  key: 'new-dashboard',
  identify,
  decide({ entities }) {
    if (!entities?.user) return false;
    return ['user1', 'user2'].includes(entities.user.id);
  },
});
```

With `vercelAdapter`, the entity and attribute names in the returned object (`user.id` here) are what dashboard rules and `vercel flags split|rollout|rules --by` target. They must match the entities and attribute types configured in the dashboard. See [references/providers.md — User targeting](references/providers.md#user-targeting) and [Attribute types](references/providers.md#attribute-types).

### Flag with another adapter

Adapters connect flags to third-party providers. Each adapter replaces `decide` and `origin`:

```ts
import { flag } from 'flags/next';
import { statsigAdapter } from '@flags-sdk/statsig';

export const myGate = flag({
  key: 'my_gate',
  adapter: statsigAdapter.featureGate((gate) => gate.value),
  identify,
});
```

See [references/providers.md](references/providers.md) for all supported adapters.

### Key parameters

| Parameter      | Type                               | Description                                          |
| -------------- | ---------------------------------- | ---------------------------------------------------- |
| `key`          | `string`                           | Unique flag identifier                               |
| `decide`       | `function`                         | Resolves the flag value                              |
| `defaultValue` | `any`                              | Fallback if `decide` returns undefined or throws     |
| `description`  | `string`                           | Shown in Flags Explorer                              |
| `origin`       | `string`                           | URL to manage the flag in provider dashboard         |
| `options`      | `{ label?: string, value: any }[]` | Possible values, used for precompute + Flags Explorer|
| `adapter`      | `Adapter`                          | Provider adapter implementing `decide` and `origin`  |
| `identify`     | `function`                         | Returns evaluation context (entities) for `decide`   |

## Dedupe

Wrap shared functions (especially `identify`) in `dedupe` to run them once per request:

```ts
import { dedupe } from 'flags/next';

const identify = dedupe(({ cookies }) => {
  return { user: { id: cookies.get('uid')?.value } };
});
```

Note: `dedupe` is not available in Pages Router.

## Bulk evaluation

To evaluate **multiple** flags at once, call `evaluate()` (from `flags/next`) instead of awaiting flags one at a time or using `Promise.all()`. To evaluate a **single** flag, just call it: `await myFlag()`.

```ts
import { evaluate } from 'flags/next';
import { flagA, flagB } from '../flags';

// avoid: each await blocks the next, so the flags resolve sequentially
const a = await flagA();
const b = await flagB();

// avoid: parallel, but each flag is evaluated in isolation
const [a, b] = await Promise.all([flagA(), flagB()]);

// prefer: shares work across the batch
const [a, b] = await evaluate([flagA, flagB]);
```

`evaluate()` is faster than both approaches. Awaiting flags one at a time makes total latency the sum of every flag's evaluation instead of the slowest single flag, while `Promise.all()` runs them in parallel but evaluates each in isolation. `evaluate()` pre-reads headers, cookies, and overrides once for the whole batch and lets adapters resolve a group in a single call, which reduces the number of parallel promises the runtime manages and leaves less room for the async work to be interrupted by other microtasks.

It accepts either an **array** (positional results) or an **object** (keyed results):

```ts
const [a, b] = await evaluate([flagA, flagB]);
const { a, b } = await evaluate({ a: flagA, b: flagB });
```

Outside App Router (Pages Router `getServerSideProps`/API routes, or routing middleware), pass the request as the second argument: `await evaluate([flagA, flagB], request)`.

`evaluate()` always evaluates flags at request time. It is not for reading [precomputed](#precompute-pattern) (static) values — for those, use `getPrecomputed` (or call the flag with the code, `await myFlag(code, flagGroup)`).

Adapters can opt into batching by implementing the optional `bulkDecide` hook. The Vercel adapter (`@flags-sdk/vercel`) implements it — roughly a 10x reduction in evaluation time when resolving hundreds of flags. See [references/providers.md — Custom Adapters](references/providers.md#custom-adapters) for implementing `bulkDecide`, and [references/api.md — `evaluate`](references/api.md#evaluate) for the full signature.

## Flags Explorer setup

### Next.js (App Router)

```ts
// app/.well-known/vercel/flags/route.ts
import { createFlagsDiscoveryEndpoint } from 'flags/next';
import { getProviderData } from '@flags-sdk/vercel';
import * as flags from '../../../../flags'; // adjust if flags live under lib/ or src/

export const GET = createFlagsDiscoveryEndpoint(async () => {
  return getProviderData(flags);
});
```

### With external provider data

When using a third-party provider alongside Vercel Flags, combine their data with `mergeProviderData`. Each provider adapter exports its own `getProviderData` — see the provider-specific examples in [references/providers.md](references/providers.md).

### SvelteKit

```ts
// src/hooks.server.ts
import { createHandle } from 'flags/sveltekit';
import { FLAGS_SECRET } from '$env/static/private';
import * as flags from '$lib/flags';

export const handle = createHandle({ secret: FLAGS_SECRET, flags });
```

## FLAGS_SECRET

Required for precompute and Flags Explorer. Vercel Flags activation creates a value per environment. Preserve existing values; do not rotate them during ordinary SDK setup. A missing local value does not mean the remote value is missing: check the target environment first, then follow [Pull environment variables](#pull-environment-variables) for Development.

Only generate a secret for an environment where it is absent. Use 32 cryptographically random bytes, base64-encoded, with a distinct value per environment. Mark Preview and Production values Sensitive. Send generated values directly to storage, such as stdin for `vercel env add`; do not print them to terminal output, logs, or chat, or embed them in command arguments.

## Precompute pattern

Use precompute to keep pages static while using feature flags. Middleware evaluates flags and encodes results into the URL via rewrite. The page reads precomputed values instead of re-evaluating.

High-level flow:
1. Declare flags and group them in an array
2. Call `precompute(flagGroup)` in middleware, get a `code` string
3. Rewrite request to `/${code}/original-path`
4. Page reads flag values from `code`: `await myFlag(code, flagGroup)`

For full implementation details, see framework-specific references:
- **Next.js**: See [references/nextjs.md](references/nextjs.md) — covers proxy middleware, precompute setup, ISR, generatePermutations, multiple groups
- **SvelteKit**: See [references/sveltekit.md](references/sveltekit.md) — covers reroute hook, middleware, precompute setup, ISR, prerendering

## Custom adapters

Create an adapter factory that returns an object with `origin` and `decide`. For the full pattern (including default adapter and singleton client examples), see [references/providers.md](references/providers.md#custom-adapters).

## Encryption functions

For keeping flag data confidential in the browser (used by Flags Explorer):

| Function                   | Purpose                             |
| -------------------------- | ----------------------------------- |
| `encryptFlagValues`        | Encrypt resolved flag values        |
| `decryptFlagValues`        | Decrypt flag values                 |
| `encryptFlagDefinitions`   | Encrypt flag definitions/metadata   |
| `decryptFlagDefinitions`   | Decrypt flag definitions            |
| `encryptOverrides`         | Encrypt toolbar overrides           |
| `decryptOverrides`         | Decrypt toolbar overrides           |

All use `FLAGS_SECRET` by default. Example:

```tsx
import { encryptFlagValues } from 'flags';
import { FlagValues } from 'flags/react';

async function ConfidentialFlags({ values }) {
  const encrypted = await encryptFlagValues(values);
  return <FlagValues values={encrypted} />;
}
```

## React components

```tsx
import { FlagValues, FlagDefinitions } from 'flags/react';

// Renders script tag with flag values for Flags Explorer
<FlagValues values={{ myFlag: true }} />

// Renders script tag with flag definitions for Flags Explorer
<FlagDefinitions definitions={{ myFlag: { options: [...], description: '...' } }} />
```

## References

Detailed framework and provider guides are in separate files to keep context lean:

- **[references/nextjs.md](references/nextjs.md)**: Next.js quickstart, toolbar, App Router, Pages Router, middleware/proxy, precompute, dedupe, dashboard pages, marketing pages, suspense fallbacks
- **[references/sveltekit.md](references/sveltekit.md)**: SvelteKit quickstart, toolbar, hooks setup, precompute with reroute + middleware, dashboard pages, marketing pages
- **[references/providers.md](references/providers.md)**: All provider adapters — Vercel, Global Config, Statsig, LaunchDarkly, PostHog, GrowthBook, Flagsmith, Reflag, Split, Optimizely, OpenFeature, and custom adapters
- **[references/api.md](references/api.md)**: Full API reference for `flags`, `flags/react`, `flags/next`, and `flags/sveltekit`
