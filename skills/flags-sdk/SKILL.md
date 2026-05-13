---
name: flags-sdk
description: >
  Guide for feature flags and A/B tests with the Flags SDK (`flags` npm package) and Vercel Flags.
  Use when: declaring flags with `flag()`, using `vercelAdapter()` or `vercel flags` CLI
  (add, list, enable, disable, inspect, archive, rm, sdk-keys),
  setting up providers/adapters (Vercel, Statsig, LaunchDarkly, PostHog, GrowthBook, Hypertune,
  Edge Config, OpenFeature, Split, Flagsmith, Reflag, Optimizely, or custom adapters),
  implementing precompute patterns for static pages, setting up `identify`/`dedupe`,
  integrating Flags Explorer/Toolbar,
  working with flags in Next.js (App Router, Pages Router, Middleware) or SvelteKit,
  writing custom adapters, or encrypting/decrypting flag values.
  Triggers: feature flags, A/B testing, experimentation, flags SDK, flag adapters, precompute,
  Flags Explorer, feature gates, flag overrides, Vercel Flags, vercel flags CLI, vercel flags add,
  vercel flags list, vercel flags enable, vercel flags disable,
  `flags/next`, `flags/sveltekit`, `flags/react`, `@flags-sdk/*`.
---

# Flags SDK

The Flags SDK (`flags` npm package) is a feature flags toolkit for Next.js and SvelteKit. It turns each feature flag into a callable function, works with any flag provider via adapters, and keeps pages static using the precompute pattern. Vercel Flags is the first-party provider, letting you manage flags from the Vercel dashboard or the `vercel flags` CLI.

- Docs: https://flags-sdk.dev
- Repo: https://github.com/vercel/flags

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
  adapter: vercelAdapter(),
});
```

## Agent workflow: Creating a new flag

When a user asks you to create or add a feature flag, follow these steps in order. Do not leave CLI steps as "next steps" for the user — execute them yourself.

### Before you start

Check the project state to adapt commands and decide which steps you can skip:

- Which lockfile is present (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`)? → Adapt all package manager commands accordingly (`pnpm add`, `npm install`, `yarn add`, `bun add`).
- Is `flags` in `package.json`? → Skip install (step 1)
- Does `.vercel/` directory exist? → Project is linked, skip `vercel link` in step 2
- Does `.env.local` contain `FLAGS=`? → Env vars already pulled, skip step 3
- Does `flags.ts` (or `lib/flags.ts`, `src/flags.ts`) exist? → Add to it rather than creating from scratch (step 4)
- Is `@vercel/toolbar` in `package.json`? → Skip toolbar setup (step 6)
- Does `app/.well-known/vercel/flags/route.ts` exist? → Flags Explorer already set up, skip step 7

### Steps

1. **Install packages** (if not already in `package.json`):
   ```bash
   pnpm i flags @flags-sdk/vercel
   ```

2. **Register the flag with Vercel**: Run `vercel flags add <flag-key> --kind boolean --description "<description>"`.

   > **Prerequisite**: The `vercel flags` commands require the Vercel CLI to be installed and authenticated. If the Vercel CLI is not installed, run `pnpm i -g vercel`. For authentication or linking issues, read and follow the `vercel-cli` skill. If it's not installed, run `npx skills add https://github.com/vercel/vercel --skill vercel-cli`.

   Before running `vercel flags add`, verify the project is linked to Vercel. Check for a `.vercel` directory in the project root. If it doesn't exist, run `vercel link` first.

3. **Pull environment variables**: Run `vercel env pull` to write `FLAGS` and `FLAGS_SECRET` to `.env.local`. Without these environment variables, `vercelAdapter()` will not be able to evaluate flags. This step is **mandatory** after creating a flag.

4. **Declare the flag in code**: Add it to `flags.ts` (or create the file if it doesn't exist) using `vercelAdapter()`:
   ```ts
   import { flag } from 'flags/next';
   import { vercelAdapter } from '@flags-sdk/vercel';

   export const myFlag = flag({
     key: 'my-flag',
     adapter: vercelAdapter(),
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

6. **Set up the Vercel Toolbar** (if not already present):
   - Run `pnpm i @vercel/toolbar`
   - Wrap `next.config.ts` with the toolbar plugin
   - Render `<VercelToolbar />` in the root layout
   See [references/nextjs.md — Toolbar Setup](references/nextjs.md#toolbar-setup) for the full code.

7. **Set up Flags Explorer** (if not already present): Create `app/.well-known/vercel/flags/route.ts` — see the [Flags Explorer setup](#flags-explorer-setup) section below.

## Vercel Flags

Vercel Flags is Vercel's feature flags platform. You create and manage flags from the Vercel dashboard or the `vercel flags` CLI, then connect them to your code with the `@flags-sdk/vercel` adapter. When you create a flag in Vercel, the `FLAGS` and `FLAGS_SECRET` environment variables are configured automatically.

To create a flag end-to-end, follow the [Agent workflow](#agent-workflow-creating-a-new-flag) above.

For the full Vercel provider reference — user targeting, `vercel flags` CLI subcommands, custom adapter configuration, and Flags Explorer setup — see [references/providers.md](references/providers.md#vercel).

## Declaring flags

When using Vercel Flags, declare flags with `vercelAdapter()` as shown in the [Agent workflow](#agent-workflow-creating-a-new-flag). For other providers, see [references/providers.md](references/providers.md). Below are the general `flag()` patterns.

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

## Flags Explorer setup

### Next.js (App Router)

```ts
// app/.well-known/vercel/flags/route.ts
import { createFlagsDiscoveryEndpoint } from 'flags/next';
import { getProviderData } from '@flags-sdk/vercel';
import * as flags from '../../../../flags';

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

Required for precompute and Flags Explorer. Must be 32 random bytes, base64-encoded:

```sh
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
```

Use a separate `FLAGS_SECRET` value for each environment (Development, Preview, Production), and mark the Preview and Production values as Sensitive. Run the generator once per environment to produce distinct values, then store each on Vercel:

```sh
vercel env add FLAGS_SECRET production --sensitive --value <production-secret>
vercel env add FLAGS_SECRET preview --sensitive --value <preview-secret>
vercel env add FLAGS_SECRET development --value <development-secret>
```

Then run `vc env pull` to sync to local.

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
- **[references/providers.md](references/providers.md)**: All provider adapters — Vercel, Edge Config, Statsig, LaunchDarkly, PostHog, GrowthBook, Hypertune, Flagsmith, Reflag, Split, Optimizely, OpenFeature, and custom adapters
- **[references/api.md](references/api.md)**: Full API reference for `flags`, `flags/react`, `flags/next`, and `flags/sveltekit`
