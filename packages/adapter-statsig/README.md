# Flags SDK — Statsig Adapter

An adapter to use [Statsig](https://github.com/statsig/statsig-node-lite) feature management primitives with the [Flags SDK](https://flags-sdk.dev/).

## Installation

```bash
pnpm i @flags-sdk/statsig

# Optional peer dependencies for use with Vercel and Edge Config
pnpm i @flags-sdk/statsig statsig-node-vercel @vercel/edge-config @vercel/functions
```

## Overview

Use Statsig's Feature Management (Feature Gates and Dynamic Configs) with the Flags SDK.

The Flags SDK can help dynamically serve static variants of your pages.

- Define pages with [generateStaticParams](https://nextjs.org/docs/app/api-reference/functions/generate-static-params#all-paths-at-runtime)
- Define flags powered by Statsig using the adapter
- Use [precompute](https://flags-sdk.dev/concepts/precompute#export-flags-to-be-precomputed) to route users to static page variants.

[[Read more about the Precompute concept](https://flags-sdk.dev/concepts/precompute)]

## Usage

### Environment Variables

```bash
# Required
STATSIG_SERVER_SECRET="secret-..."

# Optional
STATSIG_PROJECT_ID="..."
STATSIG_EDGE_CONFIG="edge-config-connection-string"
STATSIG_EDGE_CONFIG_ITEM_KEY="edge-config-item-key"
```

### Identifying the Statsig User

```ts
// #/lib/user.ts
import { dedupe } from '@vercel/flags/next';
import { type StatsigUser } from 'statsig-node-lite';

const identifyStatsigUser = dedupe(
  async function identify(): Promise<StatsigUser> {
    return {
      userID: '...',
      customIDs: { stableID: '...' },
    } as StatsigUser;
  },
);
```

```ts
// #/flags.ts
import { dedupe } from '@vercel/flags/next';
import { statsigAdapter } from '@flags_sdk/statsig';
import { identifyStatsigUser } from '#/lib/user';

// Feature Gate
export const exampleFlag = flag<boolean>({
  // The key of the Feature Gate in the Statsig Console
  key: 'new_feature_gate',
  adapter: statsigAdapter.featureGate((gate) => gate.value),
  defaultValue: false,
  identify: identifyStatsigUser,
});

// Dynamic Config
export const marketingConfig = flag<Record<string, unknown>>({
  // The key of the Dynamic Config in the Statsig Console
  key: 'marketing_config',
  adapter: statsigAdapter.dynamicConfig((config) => config.value),
  defaultValue: { bannerText: 'Buy now' },
  identify: identifyStatsigUser,
});
```

## Caveats

### Statsig Node Lite

The adapter uses `statsig-node-lite` to provide defaults optimized for server side and middleware usage.

### Experimentation

Flags SDK currently only implements Statsig's feature management primitives.

### Exposure Logging

Because middleware and server components are evaluated when routes are prefetched, exposures are not logged by default. You can enable exposure logging by providing the `exposureLogging` option to the adapter functions.

```ts
export const exampleFlag = flag<boolean, StatsigUser>({
  key: "new_feature_gate",
  ...
  adapter: statsigAdapter.featureGate((gate) => gate.value, {
    exposureLogging: true,
  })
});
```

When logging is on, your application should also call `Statsig.flush` appropriately to ensure exposures are recorded.

The recommended approach for experimentation is to log exposures from the client when
the user is indeed exposed to an experiment, either when seen or interacted with.

[Read about Statsig's React Bindings](https://docs.statsig.com/client/javascript-sdk/react#basics-get-experiment)

### Config Spec Synchronization

At the time of writing, Statsig config specs are synchronized using a timer created outside of a request context. This is not supported in the Edge Runtime,
and the adapter can support a solution that will resolve this.

To enable synchronization with Vercel's `waitUntil` function, please install the optional peer dependency `@vercel/functions`.

### Statsig Bootstrapping

Bootstrapping is recommended for use in React Server Components, but prevents static page generation when using ISR/static pages with middleware rewrites. For such cases,
see avoiding bootstrapping below.

You can call `statsigAdapter.initialize()` to initialize the `statsig-node-lite` SDK.

This can be used in place of `Statsig.initialize` in middleware, API routes, and server components/functions.

```ts
// app/api/bootstrap/route.ts
import { NextResponse } from 'next/server';
import { statsigAdapter } from '@flags-sdk/statsig';

export const runtime = 'edge';

export async function GET() {
  const Statsig = await statsigAdapter.initialize();
  const initializeResponse = await Statsig.getClientInitializeResponse(user, {
    hash: 'djb2',
  });
  return new NextResponse(JSON.stringify(initializeResponse));
}
```

### Avoiding bootstrapping for static pages

User information cannot be prerendered, but it's possible to prerender/ISR the
different variants of flags and experiments and rewrite them using precompute.

In this case, user info should be fetched on the client, and exposures should
be logged as a client side effect.

Read more about initialization strategies in the [Statsig Docs](https://docs.statsig.com/client/javascript-sdk/init-strategies)
