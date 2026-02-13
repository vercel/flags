---
name: flags-sdk
description: >
  Comprehensive guide for implementing feature flags and A/B tests using the Flags SDK (the `flags` npm package).
  Use when: (1) Creating or declaring feature flags with `flag()`, (2) Setting up feature flag providers/adapters
  (Vercel, Statsig, LaunchDarkly, PostHog, GrowthBook, Hypertune, Edge Config, OpenFeature, Flagsmith, Reflag,
  Split, Optimizely, or custom adapters), (3) Implementing precompute patterns for static pages with feature flags,
  (4) Setting up evaluation context with `identify` and `dedupe`, (5) Integrating the Flags Explorer / Vercel Toolbar,
  (6) Working with feature flags in Next.js (App Router, Pages Router, Middleware) or SvelteKit,
  (7) Writing custom adapters, (8) Encrypting/decrypting flag values for the toolbar,
  (9) Any task involving the `flags`, `flags/next`, `flags/sveltekit`, `flags/react`, or `@flags-sdk/*` packages.
  Triggers on: feature flags, A/B testing, experimentation, flags SDK, flag adapters, precompute flags,
  Flags Explorer, feature gates, flag overrides.
---

# Flags SDK

The Flags SDK (`flags` npm package) is a feature flags toolkit for Next.js and SvelteKit. It turns each feature flag into a callable function, works with any flag provider via adapters, and keeps pages static using the precompute pattern.

- Docs: https://flags-sdk.dev
- Repo: https://github.com/vercel/flags

## Core Concepts

### Flags as Code

Each flag is declared as a function — no string keys at call sites:

```ts
import { flag } from 'flags/next';

export const exampleFlag = flag({
  key: 'example-flag',
  decide() { return false; },
});

// Usage: just call the function
const value = await exampleFlag();
```

### Server-Side Evaluation

Evaluate flags server-side to avoid layout shift, keep pages static, and maintain confidentiality. Use routing middleware + precompute to serve static variants from CDN.

### Adapter Pattern

Adapters replace `decide` and `origin` on a flag declaration, enabling provider-agnostic flags:

```ts
import { flag } from 'flags/next';
import { statsigAdapter } from '@flags-sdk/statsig';

export const myGate = flag({
  key: 'my_gate',
  adapter: statsigAdapter.featureGate((gate) => gate.value),
  identify,
});
```

## Declaring Flags

### Basic Flag

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

### Flag with Evaluation Context

Use `identify` to establish who the request is for; `decide` receives the entities:

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

### Flag with Adapter

```ts
import { flag } from 'flags/next';
import { vercelAdapter } from '@flags-sdk/vercel';

export const exampleFlag = flag({
  key: 'example-flag',
  adapter: vercelAdapter(),
});
```

### Key Parameters

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

## Flags Explorer Setup

### Next.js (App Router)

```ts
// app/.well-known/vercel/flags/route.ts
import { getProviderData, createFlagsDiscoveryEndpoint } from 'flags/next';
import * as flags from '../../../../flags';

export const GET = createFlagsDiscoveryEndpoint(async () => {
  return getProviderData(flags);
});
```

### With External Provider Data

```ts
import { getProviderData, createFlagsDiscoveryEndpoint } from 'flags/next';
import { getProviderData as getStatsigProviderData } from '@flags-sdk/statsig';
import { mergeProviderData } from 'flags';
import * as flags from '../../../../flags';

export const GET = createFlagsDiscoveryEndpoint(async () => {
  return mergeProviderData([
    getProviderData(flags),
    getStatsigProviderData({
      consoleApiKey: process.env.STATSIG_CONSOLE_API_KEY,
      projectId: process.env.STATSIG_PROJECT_ID,
    }),
  ]);
});
```

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

Store as `FLAGS_SECRET` env var. On Vercel: `vc env add FLAGS_SECRET` then `vc env pull`.

## Precompute Pattern (Overview)

Use precompute to keep pages static while using feature flags. Middleware evaluates flags and encodes results into the URL via rewrite. The page reads precomputed values instead of re-evaluating.

High-level flow:
1. Declare flags and group them in an array
2. Call `precompute(flagGroup)` in middleware, get a `code` string
3. Rewrite request to `/${code}/original-path`
4. Page reads flag values from `code`: `await myFlag(code, flagGroup)`

For full implementation details, see framework-specific references:
- **Next.js**: See [references/nextjs.md](references/nextjs.md) — covers proxy middleware, precompute setup, ISR, generatePermutations, multiple groups
- **SvelteKit**: See [references/sveltekit.md](references/sveltekit.md) — covers reroute hook, middleware, precompute setup, ISR, prerendering

## Custom Adapters

Create an adapter factory returning an object with `origin` and `decide`:

```ts
import type { Adapter } from 'flags';

export function createMyAdapter(/* options */) {
  return function myAdapter<ValueType, EntitiesType>(): Adapter<ValueType, EntitiesType> {
    return {
      origin(key) {
        return `https://my-provider.com/flags/${key}`;
      },
      async decide({ key }): Promise<ValueType> {
        // evaluate against your provider
        return false as ValueType;
      },
    };
  };
}
```

## Encryption Functions

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

## React Components

```tsx
import { FlagValues, FlagDefinitions } from 'flags/react';

// Renders script tag with flag values for Flags Explorer
<FlagValues values={{ myFlag: true }} />

// Renders script tag with flag definitions for Flags Explorer
<FlagDefinitions definitions={{ myFlag: { options: [...], description: '...' } }} />
```

## References

Detailed framework and provider guides are in separate files to keep context lean:

- **[references/nextjs.md](references/nextjs.md)**: Next.js quickstart, App Router, Pages Router, middleware/proxy, precompute, dedupe, dashboard pages, marketing pages, suspense fallbacks
- **[references/sveltekit.md](references/sveltekit.md)**: SvelteKit quickstart, hooks setup, toolbar, precompute with reroute + middleware, dashboard pages, marketing pages
- **[references/providers.md](references/providers.md)**: All provider adapters — Vercel, Edge Config, Statsig, LaunchDarkly, PostHog, GrowthBook, Hypertune, Flagsmith, Reflag, Split, Optimizely, OpenFeature, and custom adapters
- **[references/api.md](references/api.md)**: Full API reference for `flags`, `flags/react`, `flags/next`, and `flags/sveltekit`
