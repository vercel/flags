# Flags SDK — Statsig Adapter

An adapter to use [Statsig](https://github.com/statsig/statsig-node-lite) feature management primitives with the [Flags SDK](https://flags-sdk.dev/).

## Installation

```bash
pnpm i @flags_sdk/statsig
```

## Overview

The primary use case for this adapter is to use Statsig with the flags-sdk `precompute` pattern
in order to serve dynamic variations pages while maintaining cache hits by using rewrites in middleware.

- Define pages with [generateStaticParams](https://nextjs.org/docs/app/api-reference/functions/generate-static-params#all-paths-at-runtime)
- Define flags powered by the Statsig adapter
- Use [precompute](https://flags-sdk.dev/concepts/precompute#export-flags-to-be-precomputed) to route users to static page variants.

## Usage

Import the default Statsig adapter.

```ts
// Environment variable required: STATSIG_SERVER_SECRET
import { statsigAdapter } from '@flags_sdk/statsig';
```

Define an identify function that can compute a `StatsigUser` from the request.

```ts
type Entities = { statsigUser: StatsigUser };

const identify = dedupe(
  async (): Promise<Entities> => ({
    statsigUser: await getStatsigUser(),
  }),
);
```

### Feature Gates

Statsig Feature Gates resolve a value that is a boolean.

```ts
export const exampleFlag = flag<boolean, Entities>({
  key: 'new_feature_gate',
  identify,
  defaultValue: false,
  adapter: statsigAdapter.featureGate((gate) => gate.value),
});
```

### Dynamic Configs

Statsig Dynamic Configs resolve to a JSON object.

```ts
export const marketingConfig = flag<Record<string, unknown>, Entities>({
  key: 'marketing_config',
  identify,
  defaultValue: { bannerText: 'Buy now' },
  adapter: statsigAdapter.dynamicConfig((config) => config.value),
});
```

### Experimentation

Flags SDK currently only implements Statsig's feature management primitives.

## Enhancements

Install optional Peer dependencies

```bash
pnpm i @vercel/functions @vercel/edge-config statsig-node-vercel
```

### Vercel

The `STATSIG_PROJECT_ID` environment variable enhances Vercel's Flags Explorer with deep links.

Override options in the Vercel toolbar are powered by `options` passed to flag definitions:

```ts
type Toggles = { a: number; b: number };

export const exampleFlag = flag<Toggles, Entities>({
  key: 'product_x_toggles',
  // ...
  options: [
    // label: shown to users; value: resolved flag values
    { label: 'All off', value: { a: 0, b: 0 } },
    { label: 'All on', value: { a: 1, b: 1 } },
  ],
});
```

Definitions for the `.well-known/vercel/flags` endpoint can be powered by provider data:

[Feature flag JSON response definitions](https://vercel.com/docs/workflow-collaboration/feature-flags/supporting-feature-flags#valid-json-response)

```ts
import { getProviderData } from '@flags_sdk/statsig/provider';
// ...
const statsigProviderData = await getProviderData({
  statsigConsoleApiKey: 'console-this-is-a-test-token',
  projectId: 'project-id-placeholder',
});
// ...
```

## Caveats

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
