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

Package: `@flags-sdk/vercel`

```bash
pnpm i flags @flags-sdk/vercel
```

### Setup

> **Prerequisite**: The `vercel flags` commands require the Vercel CLI to be installed and authenticated. If the Vercel CLI is not installed, run `pnpm i -g vercel`. For authentication or linking issues, read and follow the `vercel-cli` skill. If it's not installed, run `npx skills add https://github.com/vercel/vercel --skill vercel-cli`.

Before running any `vercel flags` command, verify the project is linked to Vercel. Check for a `.vercel` directory in the project root. If it doesn't exist, run `vercel link` first.

1. Create a flag in the Vercel dashboard or via CLI: `vercel flags add <flag-key> --kind boolean --description "<description>"`
2. Pull env vars: you **must** run `vercel env pull` to write `FLAGS` and `FLAGS_SECRET` to `.env.local`. Without these environment variables, `vercelAdapter()` will not be able to evaluate flags.
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

### Using your own client (e.g. for singleton)

If the app also uses `@vercel/flags-core` directly, create the client once and pass it to the adapter so both share the same instance:

```ts
import { createClient } from '@vercel/flags-core';
import { createVercelAdapter } from '@flags-sdk/vercel';

const vercelFlagsClient = createClient(process.env.FLAGS);
const vercelAdapter = createVercelAdapter(vercelFlagsClient);

export const exampleFlag = flag({
  key: 'example-flag',
  adapter: vercelAdapter(),
});
```

### `vercel flags` CLI

Manage Vercel Flags from the terminal. Requires the [Vercel CLI](https://vercel.com/docs/cli) and a linked project.

> **Prerequisite**: The Vercel CLI must be installed (`pnpm i -g vercel`) and the project must be linked (`vercel link` — check for a `.vercel` directory). For authentication issues, read and follow the `vercel-cli` skill.

#### Subcommands

| Subcommand   | Description                                           |
| ------------ | ----------------------------------------------------- |
| `list`       | List all flags in the project                         |
| `add`        | Create a new flag                                     |
| `inspect`    | Show details, status, and targeting rules of a flag   |
| `enable`     | Enable a boolean flag for a specific environment      |
| `disable`    | Disable a boolean flag for a specific environment     |
| `archive`    | Archive a flag (required before deleting)              |
| `rm`         | Delete an archived flag                               |
| `sdk-keys`   | Manage SDK keys (subcommands: `ls`, `add`, `rm`)      |

#### Create and toggle a flag

```bash
# Create a boolean flag with a description
vercel flags add my-feature --kind boolean --description "New onboarding flow"

# Enable in development first
vercel flags enable my-feature --environment development

# Promote to production
vercel flags enable my-feature --environment production

# Disable in production
vercel flags disable my-feature --environment production

# Change string variant in production
vercel flags set my-feature -e production --variant my-variant
```

`enable` and `disable` only work with boolean flags. For changing the state of other flag types, use the `set` command. Use the vercel-cli skill for full reference.


#### Inspect and list flags

```bash
# Show details of a specific flag (status, environments, targeting rules)
vercel flags inspect my-feature

# List all flags in the project
vercel flags list
```

#### Archive and delete a flag

A flag must be archived before it can be deleted:

```bash
vercel flags archive my-feature
vercel flags rm my-feature
```

#### Manage SDK keys

SDK keys connect your application to Vercel Flags. The `FLAGS` environment variable contains an SDK key.

```bash
# List SDK keys for the project
vercel flags sdk-keys ls

# Create a new SDK key
vercel flags sdk-keys add

# Remove an SDK key
vercel flags sdk-keys rm <sdk-key-id>
```

These examples cover common flag operations. For the full `vercel flags` reference and other Vercel CLI commands, see the `vercel-cli` skill. If it's not installed: `npx skills add https://github.com/vercel/vercel --skill vercel-cli`

Full CLI reference: https://vercel.com/docs/cli/flags

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
pnpm i @flags-sdk/statsig
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
pnpm i @flags-sdk/launchdarkly
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
pnpm i @flags-sdk/growthbook
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
pnpm i @flags-sdk/flagsmith
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
pnpm i @flags-sdk/reflag
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
pnpm i @flags-sdk/openfeature @openfeature/server-sdk
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
