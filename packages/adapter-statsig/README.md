# Flags SDK — Statsig Adapter

An adapter to use [Statsig](https://github.com/statsig/statsig-node-lite) feature management primitives with the [Flags SDK](https://flags-sdk.dev/).

## Installation

```bash
pnpm i @flags_sdk/statsig

# Optional peer dependencies for use with Vercel and Edge Config
pnpm i @flags_sdk/statsig statsig-node-vercel @vercel/edge-config @vercel/functions
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
// lib/identify-statsig-user.ts
import { dedupe } from '@vercel/flags/next';
import { type StatsigUser } from 'statsig-node-lite';

const identifyStatsigUser = dedupe(async function identify(): Promise<{
  statsigUser: StatsigUser;
}> {
  // TODO: Build a valid StatsigUser for usage in your application
  const statsigUser = {
    userID: '...',
    customIDs: { stableID: '...' },
  } as StatsigUser;
  return {
    statsigUser,
  };
});
```

```ts
// flags.ts
import { dedupe } from '@vercel/flags/next';
import { statsigAdapter } from '@flags_sdk/statsig';
import { identifyStatsigUser } from './lib/identify-statsig-user';

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

React Server Components and middleware are also evaluated when routes are prefetched. Logging exposures from the flags-sdk may mean exposures are recorded
even though a user has not navigated to the page. When it is critical to avoid unnecessary exposures, options can be provided to the adapter so that they
can be logged manually.

```ts
export const exampleFlag = flag<boolean, Entities>({
  key: "new_feature_gate",
  ...
  adapter: statsigAdapter.featureGate((gate) => gate.value, {
    exposureLoggingDisabled: true,
  })
});
```

When logging automatically, the application should also call `Statsig.flush` appropriately to ensure exposures are recorded.

When logging manually, the adapter function can call `.getRuleID()` to get the rule ID for the current request.
While this can be used to manually log exposures on the client, these IDs can impact cache hit ratio when used with middleware.

### Config Spec Synchronization

At the time of writing, Statsig config specs are synchronized using a timer created outside of a request context. This is not supported in the Edge Runtime,
and the adapter can support a solution that will resolve this.

To enable synchronization with Vercel's `waitUntil` function, please install the optional peer dependency `@vercel/functions`.

### Statsig Bootstrapping

It is desirable to initialize Statsig in only one place on the server and with one library.

The adapter will call `Statsig.initialize` and uses `statsig-node-lite` to provide defaults optimized for server side and middleware usage.

To rely on this elsewhere in your app, like in [Statsig: Bootstrap Initialization](https://docs.statsig.com/client/concepts/initialize/#2-bootstrap-initialization),
you can rely on the adapter's `initialize` function.

```ts
// Use statsig-node-lite
import Statsig from 'statsig-node-lite';
import { statsigAdapter } from '@flags_sdk/statsig';

// Initialize the adapter
const statsigInitialization = statsigAdapter.initialize();

async function generateBootstrapValues() {
  // Wait for the adapter to initialize
  await statsigInitialization;
  // ... existing bootstrap code
}
```

### Avoiding bootstrapping for static pages

When using the Flags SDK with the Statsig adapter and middleware rewrites, adding server bootstrapping causes the page to become dynamically rendered.

To maintain static page generation and cache hits, consider resolving values using the adapter and using a simple Statsig Provider.

```tsx
'use client';
import { LogLevel } from '@statsig/react-bindings';
import { StatsigProvider } from '@statsig/react-bindings';
import { StatsigAutoCapturePlugin } from '@statsig/web-analytics';
import { getStatsigUser } from '../lib/user-client';

// Bootstrapping is recommended for dynamic pages using React Server Components
// This client may be used with statically generated pages
// See: https://flags-sdk.dev/concepts/precompute
export function StatsigClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StatsigProvider
      sdkKey={process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY!}
      user={getStatsigUser()}
      options={{
        logLevel: LogLevel.Debug,
        plugins: [new StatsigAutoCapturePlugin()],
      }}
    >
      {children}
    </StatsigProvider>
  );
}
```
