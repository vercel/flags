# Provider Adapters

## Table of Contents

- [Vercel](#vercel)
- [Global Config](#global-config)
- [Statsig](#statsig)
- [LaunchDarkly](#launchdarkly)
- [PostHog](#posthog)
- [GrowthBook](#growthbook)
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

> **Prerequisite**: The Vercel CLI must be installed and authenticated. If it is not installed, run `pnpm i -g vercel`. For authentication or linking issues, follow the `vercel-cli` skill if it's already available. If it isn't, suggest the user install it with `npx skills add vercel/vercel@vercel-cli` (don't auto-install it) and rely on `vercel <command> --help` in the meantime.

The following steps integrate a flag into an app and need a linked project for `vercel env pull` ([Set up the SDK](../SKILL.md#set-up-the-sdk), step 2). To only inspect or change remote flags, use the `vercel-flags` skill instead.

1. Create a flag in the Vercel dashboard or via CLI: `vercel flags create <flag-key> --kind boolean --description "<description>"`
2. Pull env vars: run `vercel env pull` to write the Vercel OIDC token and the Development `FLAGS_SECRET` to `.env.local` ([Pull environment variables](../SKILL.md#pull-environment-variables)).
3. Declare the flag:

```ts
import { flag } from 'flags/next';
import { vercelAdapter } from '@flags-sdk/vercel';

export const exampleFlag = flag({
  key: 'example-flag',
  adapter: vercelAdapter,
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
  adapter: vercelAdapter,
});
```

Define the entities and attributes under Flags → Entities in the dashboard before you use them in rules or segments, and return the same names from `identify` ([Entities](https://vercel.com/docs/flags/vercel-flags/dashboard/entities)). The example above allows `--by user.id` / `--by team.id` in `vercel flags split`, `rollout`, and `rules add`, and the matching conditions in dashboard rules. Entities are evaluated fresh on every call; a rule whose attribute is missing from the context is skipped.

#### Attribute types

Each attribute has a type: String, Number, Boolean, String Array, or Timestamp. The value `identify` returns must match it.

- **Timestamp** is a Unix epoch in **milliseconds** as a `number` (`Date.now()`, `user.createdAt.getTime()`, `1719792000000`). Do not pass a `Date`, an ISO string, or seconds.
- Timestamp rules only compare: is after / is before / is at or after / is at or before (`gt` / `lt` / `gte` / `lte`). Equality, one-of, and exists operators are not available for Timestamp attributes.
- Timestamp attributes cannot bucket a split or rollout (`--by`); use them in rule conditions only.
- To release at a certain time, pass the current time as `system.time` and compare against it in a rule. Keep `Date.now()` inside `dedupe` so every flag in the request sees the same time:

```ts
const identify = dedupe(async () => ({
  system: { time: Date.now() },
  user: { id: 'user-456', signupAt: 1719792000000 },
}));
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
  adapter: customAdapter,
});
```

### Using your own client (e.g. for singleton)

If the app also uses `@vercel/flags-core` directly, create the client once and pass it to the adapter so both share the same instance:

```ts
import { createClient } from '@vercel/flags-core';
import { createVercelAdapter } from '@flags-sdk/vercel';

const vercelFlagsClient = createClient(); // Vercel OIDC token, on deployments and after `vercel env pull`
const vercelAdapter = createVercelAdapter(vercelFlagsClient);

export const exampleFlag = flag({
  key: 'example-flag',
  adapter: vercelAdapter,
});
```

Outside Vercel, pass the SDK key: `createClient(process.env.FLAGS)`. Unlike `vercelAdapter()`, `createClient()` does not read `FLAGS` on its own.

### Core client in other frameworks (for example, Express)

Frameworks without a Flags SDK entrypoint use `@vercel/flags-core` directly instead of this SDK. The `vercel-flags` skill carries the example and the OIDC timing rules ([Core SDK](https://vercel.com/docs/flags/vercel-flags/sdks/core)).

### Managing flags

What a flag serves (enable, set, split, rollout, rules, segments, archive) is configured in the Vercel dashboard or with the `vercel flags` CLI, not in code. Keep the declaration in sync with the remote definition: the CLI key is the `key` in `flag()`, the kind matches the type parameter, `options` mirror the variants, and `defaultValue` is what the flag serves when it is archived or still a draft. The `vercel-flags` skill covers rollouts, experiments, promotion order, and the checks to run before archiving; `vercel flags <cmd> --help` lists the options.

CLI reference: https://vercel.com/docs/cli/flags

---

## Global Config

Package: `@flags-sdk/global-config`

```bash
pnpm i @flags-sdk/global-config
```

Env: `GLOBAL_CONFIG="global-config-connection-string"`

### Usage

```ts
import { flag } from 'flags/next';
import { globalConfigAdapter } from '@flags-sdk/global-config';

export const exampleFlag = flag({
  adapter: globalConfigAdapter,
  key: 'example-flag',
});
```

Global Config should contain:

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
import { createGlobalConfigAdapter } from '@flags-sdk/global-config';

const myAdapter = createGlobalConfigAdapter({
  connectionString: process.env.OTHER_GLOBAL_CONFIG,
  options: {
    globalConfigItemKey: 'other-flags-key',
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
- `EXPERIMENTATION_CONFIG` (optional, Global Config)
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
- `GLOBAL_CONFIG` (required)

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

Env vars, always required:
- `POSTHOG_HOST` (e.g. `https://us.i.posthog.com` or `https://eu.i.posthog.com`)
- `POSTHOG_PROJECT_API_KEY` (`phc_...`)

Optional, opts into local evaluation (background polling) instead of remote:
- `POSTHOG_SECRET_KEY` (`phs_...`)

For the Flags Explorer (`getProviderData` only):
- `POSTHOG_PERSONAL_API_KEY` (`phx_...`)
- `POSTHOG_PROJECT_ID` (e.g. `521742`)

### Methods

```ts
import { postHogAdapter } from '@flags-sdk/posthog';

// Value — boolean flag. Pass the adapter uninvoked or invoked, both work.
export const myFlag = flag<boolean>({
  key: 'my-flag',
  adapter: postHogAdapter,
  identify,
});

// Value — multivariate flag resolves to the variant string
export const myVariant = flag<string>({
  key: 'my-flag',
  adapter: postHogAdapter,
  identify,
});

// Payload
export const myPayload = flag({
  key: 'my-flag',
  adapter: postHogAdapter.payload,
  defaultValue: {},
  identify,
});
```

`identify` must return `{ distinctId }`.

### Flags Explorer

Requires: `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`

```ts
import { getProviderData as getPostHogProviderData } from '@flags-sdk/posthog';

export const GET = createFlagsDiscoveryEndpoint(() =>
  getPostHogProviderData({
    personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
    projectId: process.env.POSTHOG_PROJECT_ID!,
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

### Global Config

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

## Flagsmith

Package: `@flags-sdk/flagsmith`

```bash
pnpm i @flags-sdk/flagsmith
```

Env: `FLAGSMITH_ENVIRONMENT_KEY` (required)

Remote evaluation is the default for serverless deployments. For a long-running server, use `createFlagsmithAdapter({ environmentKey, enableLocalEvaluation: true })` with a server-side key to opt into local evaluation and environment polling. Call `adapter.close()` on shutdown to stop polling.

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

### Bulk evaluation (`bulkDecide`)

Adapters can implement an optional `bulkDecide` hook. When set (and the adapter has an `adapterId`), `evaluate()` calls it once for every group of flags that share this adapter and the same `identify` source — instead of calling `decide` per flag. This lets the provider share work across evaluations (e.g. a single network request for many flags).

```ts
return {
  adapterId: 'my-provider', // required for bulkDecide to be used
  origin(key) {
    return `https://my-provider.com/flags/${key}`;
  },
  async decide({ key }): Promise<ValueType> {
    return false as ValueType;
  },
  // Called by evaluate() for a batch of flags sharing this adapter + identify
  async bulkDecide({ flags, entities, headers, cookies }) {
    // flags: { key: string; defaultValue?: unknown }[]
    // Return a record keyed by flag key.
    return Object.fromEntries(
      flags.map(({ key }) => [key, false as ValueType]),
    );
  },
};
```

Contract:

- Return `Record<flagKey, value>`. Missing keys or `value: undefined` fall back to each flag's `defaultValue`.
- Throwing falls back to `defaultValue` per flag (and rejects for flags without a `defaultValue`).
- A flag with an inline `decide` takes precedence and is excluded from bulk evaluation.

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
  adapter: myAdapter,
});
```
