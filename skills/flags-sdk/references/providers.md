# Provider Adapters

## Table of Contents

- [Vercel](#vercel)
- [Edge Config](#edge-config)
- [Statsig](#statsig)
- [LaunchDarkly](#launchdarkly)
- [PostHog](#posthog)
- [GrowthBook](#growthbook)
- [Hypertune](#hypertune)
- [Flagsmith](#flagsmith)
- [Reflag](#reflag)
- [OpenFeature](#openfeature)
- [Split](#split)
- [Optimizely](#optimizely)
- [Custom Adapters](#custom-adapters)

---

## Vercel

Package: `@flags-sdk/vercel` (also requires `@vercel/flags-core`)

```bash
pnpm i flags @flags-sdk/vercel @vercel/flags-core
```

### Setup

1. Create a flag in the Vercel dashboard
2. Pull env vars: `vercel env pull` (sets `FLAGS` and `FLAGS_SECRET`)
3. Declare the flag:

```ts
import { flag } from 'flags/next';
import { vercelAdapter } from '@flags-sdk/vercel';

export const exampleFlag = flag({
  key: 'example-flag',
  adapter: vercelAdapter(),
});
```

### User targeting

```ts
import { dedupe, flag } from 'flags/next';
import { vercelAdapter } from '@flags-sdk/vercel';

type Entities = {
  team?: { id: string };
  user?: { id: string };
};

const identify = dedupe(async (): Promise<Entities> => ({
  team: { id: 'team-123' },
  user: { id: 'user-456' },
}));

export const exampleFlag = flag<boolean, Entities>({
  key: 'example-flag',
  identify,
  adapter: vercelAdapter(),
});
```

### Flags Explorer

```ts
import { createFlagsDiscoveryEndpoint } from 'flags/next';
import { getProviderData } from '@flags-sdk/vercel';
import * as flags from '../../../../flags';

export const GET = createFlagsDiscoveryEndpoint(async () => {
  return await getProviderData(flags);
});
```

### Custom configuration

```ts
import { createVercelAdapter } from '@flags-sdk/vercel';

const customAdapter = createVercelAdapter(process.env.CUSTOM_FLAGS_KEY!);

export const exampleFlag = flag({
  key: 'example-flag',
  adapter: customAdapter(),
});
```

---

## Edge Config

Package: `@flags-sdk/edge-config`

```bash
pnpm i @flags-sdk/edge-config
```

Env: `EDGE_CONFIG="edge-config-connection-string"`

### Usage

```ts
import { flag } from 'flags/next';
import { edgeConfigAdapter } from '@flags-sdk/edge-config';

export const exampleFlag = flag({
  adapter: edgeConfigAdapter(),
  key: 'example-flag',
});
```

Edge Config should contain:

```json
{
  "flags": {
    "example-flag": true,
    "another-flag": false
  }
}
```

### Custom configuration

```ts
import { createEdgeConfigAdapter } from '@flags-sdk/edge-config';

const myAdapter = createEdgeConfigAdapter({
  connectionString: process.env.OTHER_EDGE_CONFIG,
  options: {
    edgeConfigItemKey: 'other-flags-key',
    teamSlug: 'my-team',
  },
});
```

---

## Statsig

Package: `@flags-sdk/statsig`

```bash
npm install @flags-sdk/statsig
```

Env vars:
- `STATSIG_SERVER_API_KEY` (required)
- `STATSIG_PROJECT_ID` (optional)
- `EXPERIMENTATION_CONFIG` (optional, Edge Config)
- `EXPERIMENTATION_CONFIG_ITEM_KEY` (optional)

### Methods

```ts
import { statsigAdapter, type StatsigUser } from '@flags-sdk/statsig';

// Feature Gates
export const myGate = flag<boolean, StatsigUser>({
  key: 'my_feature_gate',
  adapter: statsigAdapter.featureGate((gate) => gate.value),
  identify,
});

// Dynamic Configs
export const myConfig = flag<Record<string, unknown>, StatsigUser>({
  key: 'my_dynamic_config',
  adapter: statsigAdapter.dynamicConfig((config) => config.value),
  identify,
});

// Experiments
export const myExperiment = flag<Record<string, unknown>, StatsigUser>({
  key: 'my_experiment',
  adapter: statsigAdapter.experiment((config) => config.value),
  identify,
});

// Autotune
export const myAutotune = flag<Record<string, unknown>, StatsigUser>({
  key: 'my_autotune',
  adapter: statsigAdapter.autotune((config) => config.value),
  identify,
});

// Layers
export const myLayer = flag<Record<string, unknown>, StatsigUser>({
  key: 'my_layer',
  adapter: statsigAdapter.layer((layer) => layer.value),
  identify,
});
```

### Same key, different mappings

Use `.` to distinguish flags from the same config:

```ts
export const text = flag<string, StatsigUser>({
  key: 'my_config.text',
  adapter: statsigAdapter.dynamicConfig((c) => c.value.text as string),
  identify,
});

export const price = flag<number, StatsigUser>({
  key: 'my_config.price',
  adapter: statsigAdapter.dynamicConfig((c) => c.value.price as number),
  identify,
});
```

### Exposure logging

Disabled by default (middleware prefetch would cause premature exposures). Enable explicitly:

```ts
adapter: statsigAdapter.featureGate((gate) => gate.value, {
  exposureLogging: true,
})
```

Log exposures from the client instead when possible.

### Flags Explorer

```ts
import { getProviderData as getStatsigProviderData } from '@flags-sdk/statsig';
import { mergeProviderData } from 'flags';

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

---

## LaunchDarkly

Package: `@flags-sdk/launchdarkly`

```bash
npm install @flags-sdk/launchdarkly
```

Env vars:
- `LAUNCHDARKLY_CLIENT_SIDE_ID` (required)
- `LAUNCHDARKLY_PROJECT_SLUG` (required)
- `EDGE_CONFIG` (required)

### Usage

```ts
import { ldAdapter, type LDContext } from '@flags-sdk/launchdarkly';

const identify = dedupe((async ({ headers, cookies }) => {
  const user = await getUser(headers, cookies);
  return { key: user.userID };
}) satisfies Identify<LDContext>);

export const exampleFlag = flag<boolean, LDContext>({
  key: 'example-flag',
  identify,
  adapter: ldAdapter.variation(),
});
```

### Flags Explorer

```ts
import { getProviderData as getLDProviderData } from '@flags-sdk/launchdarkly';

return mergeProviderData([
  getProviderData(flags),
  getLDProviderData({
    apiKey: process.env.LAUNCHDARKLY_API_KEY,
    projectKey: process.env.LAUNCHDARKLY_PROJECT_KEY,
    environment: process.env.LAUNCHDARKLY_ENVIRONMENT,
  }),
]);
```

---

## PostHog

Package: `@flags-sdk/posthog`

```bash
pnpm i @flags-sdk/posthog
```

Env vars:
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST` (e.g. `https://us.i.posthog.com`)

### Methods

```ts
import { postHogAdapter } from '@flags-sdk/posthog';

// Boolean check
export const myFlag = flag({
  key: 'my-flag',
  adapter: postHogAdapter.isFeatureEnabled(),
  identify,
});

// Multivariate value
export const myVariant = flag({
  key: 'my-flag',
  adapter: postHogAdapter.featureFlagValue(),
  identify,
});

// Payload
export const myPayload = flag({
  key: 'my-flag',
  adapter: postHogAdapter.featureFlagPayload((v) => v),
  defaultValue: {},
  identify,
});
```

### Flags Explorer

Requires: `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`

```ts
import { getProviderData as getPostHogProviderData } from '@flags-sdk/posthog';

export const GET = createFlagsDiscoveryEndpoint(() =>
  getPostHogProviderData({
    personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY,
    projectId: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_ID,
  }),
);
```

---

## GrowthBook

Package: `@flags-sdk/growthbook`

```bash
npm install @flags-sdk/growthbook
```

Env: `GROWTHBOOK_CLIENT_KEY` (required)

### Usage

```ts
import { growthbookAdapter, type Attributes } from '@flags-sdk/growthbook';

const identify = dedupe((async ({ cookies }) => ({
  id: cookies.get('user_id')?.value,
})) satisfies Identify<Attributes>);

export const myFlag = flag({
  key: 'my_feature',
  identify,
  adapter: growthbookAdapter.feature<boolean>(),
});
```

### Edge Config

Set `GROWTHBOOK_EDGE_CONNECTION_STRING` or `EXPERIMENTATION_CONFIG` (Vercel Marketplace).

### Tracking

```ts
growthbookAdapter.setTrackingCallback((experiment, result) => {
  after(async () => {
    console.log('Experiment', experiment.key, 'Variation', result.key);
  });
});
```

---

## Hypertune

Package: `@flags-sdk/hypertune`

```bash
pnpm i hypertune flags server-only @flags-sdk/hypertune @vercel/edge-config
```

Requires code generation: `npx hypertune`

```ts
import { createHypertuneAdapter } from '@flags-sdk/hypertune';
import { createSource, flagFallbacks, vercelFlagDefinitions, type Context, type FlagValues } from './generated/hypertune';

const hypertuneAdapter = createHypertuneAdapter<FlagValues, Context>({
  createSource,
  flagFallbacks,
  flagDefinitions: vercelFlagDefinitions,
  identify,
});

export const exampleFlag = flag(hypertuneAdapter.declarations.exampleFlag);
```

---

## Flagsmith

Package: `@flags-sdk/flagsmith`

```bash
npm i @flags-sdk/flagsmith
```

Env: `FLAGSMITH_ENVIRONMENT_ID` (required)

### Usage with type coercion

```ts
import { flagsmithAdapter } from '@flags-sdk/flagsmith';

export const buttonColor = flag<string>({
  key: 'button-color',
  defaultValue: 'blue',
  adapter: flagsmithAdapter.getValue({ coerce: 'string' }),
});

export const showBanner = flag<boolean>({
  key: 'show-banner',
  defaultValue: false,
  adapter: flagsmithAdapter.getValue({ coerce: 'boolean' }),
});
```

Coercion options: `'string'`, `'number'`, `'boolean'`, or omit for raw value.

---

## Reflag

Package: `@flags-sdk/reflag`

```bash
npm install @flags-sdk/reflag
```

Env: `REFLAG_SECRET_KEY`

```ts
import { reflagAdapter, type Context } from '@flags-sdk/reflag';

const identify = dedupe((async ({ headers, cookies }) => ({
  user: { id: 'user-id', name: 'name', email: 'email' },
  company: { id: 'company-id' },
})) satisfies Identify<Context>);

export const myFeature = flag<boolean, Context>({
  key: 'my_feature',
  identify,
  adapter: reflagAdapter.isEnabled(),
});
```

---

## OpenFeature

Package: `@flags-sdk/openfeature` + `@openfeature/server-sdk`

```bash
npm i @flags-sdk/openfeature @openfeature/server-sdk
```

### Setup

```ts
import { createOpenFeatureAdapter } from '@flags-sdk/openfeature';

// Sync provider
OpenFeature.setProvider(new YourProvider());
const adapter = createOpenFeatureAdapter(OpenFeature.getClient());

// Async provider
const adapter = createOpenFeatureAdapter(async () => {
  await OpenFeature.setProviderAndWait(new YourProvider());
  return OpenFeature.getClient();
});
```

### Methods

```ts
adapter.booleanValue()  // boolean flags
adapter.stringValue()   // string flags
adapter.numberValue()   // number flags
adapter.objectValue()   // object flags
```

All require `defaultValue` on the flag declaration.

---

## Split

Package: `@flags-sdk/split` (Flags Explorer only, adapter coming soon)

```ts
import { getProviderData as getSplitProviderData } from '@flags-sdk/split';

getSplitProviderData({
  adminApiKey: process.env.SPLIT_ADMIN_API_KEY,
  environmentId: process.env.SPLIT_ENVIRONMENT_ID,
  organizationId: process.env.SPLIT_ORG_ID,
  workspaceId: process.env.SPLIT_WORKSPACE_ID,
});
```

---

## Optimizely

Package: `@flags-sdk/optimizely` (Flags Explorer only, adapter coming soon)

```ts
import { getProviderData as getOptimizelyProviderData } from '@flags-sdk/optimizely';

getOptimizelyProviderData({
  projectId: process.env.OPTIMIZELY_PROJECT_ID,
  apiKey: process.env.OPTIMIZELY_API_KEY,
});
```

---

## Custom Adapters

Create an adapter factory:

```ts
import type { Adapter } from 'flags';

export function createMyAdapter(/* options */) {
  return function myAdapter<ValueType, EntitiesType>(): Adapter<ValueType, EntitiesType> {
    return {
      origin(key) {
        return `https://my-provider.com/flags/${key}`;
      },
      async decide({ key }): Promise<ValueType> {
        return false as ValueType;
      },
    };
  };
}
```

### Default adapter pattern

Expose a lazily-initialized default for simpler usage:

```ts
let defaultAdapter: ReturnType<typeof createMyAdapter> | undefined;

export function myAdapter<V, E>(): Adapter<V, E> {
  if (!defaultAdapter) {
    if (!process.env.MY_API_KEY) throw new Error('Missing MY_API_KEY');
    defaultAdapter = createMyAdapter(process.env.MY_API_KEY);
  }
  return defaultAdapter<V, E>();
}
```

Usage:

```ts
import { myAdapter } from './my-adapter';

export const exampleFlag = flag({
  key: 'example',
  adapter: myAdapter(),
});
```
