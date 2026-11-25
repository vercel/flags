# Providers

A provider is an OpenFeature server provider, used as it is. There are no adapters. A source connects a provider to flags:

- Flags files: the provider is the default export of `flags/sources/<source>/provider.ts`. With `@vercel/flags-core` in `package.json`, the source `self` has the default provider `new VercelProvider()`, and needs no `provider.ts`.
- By hand: `defineSource({ provider, project?, getEvaluationContext?, hooks? })`.

Do not call `OpenFeature.setProvider()` or `OpenFeature.getClient()`. The SDK calls the provider directly, initializes it once before the first evaluation (or at `runtime.onInit()`), waits for it, and closes it at `runtime.onShutdown()`. Do not register the same instance with the OpenFeature API too. Use a server provider (Node.js), not a web provider.

## Table of contents

- [Vercel Flags](#vercel-flags)
  - [Setup](#setup)
  - [By hand](#by-hand)
  - [Configure the client and SDK keys](#configure-the-client-and-sdk-keys)
  - [The flags of another project](#the-flags-of-another-project)
  - [Project Connections](#project-connections)
  - [Targeting](#targeting)
  - [Attribute types](#attribute-types)
  - [Flags Explorer with Vercel Flags](#flags-explorer-with-vercel-flags)
- [OpenFeature providers](#openfeature-providers)
  - [How to use a provider](#how-to-use-a-provider)
  - [Providers that connect at import](#providers-that-connect-at-import)
  - [LaunchDarkly](#launchdarkly)
  - [GrowthBook](#growthbook)
  - [Flagsmith](#flagsmith)
  - [Statsig](#statsig)
  - [PostHog](#posthog)
  - [Global Config](#global-config)
  - [Other providers](#other-providers)
  - [Reflag](#reflag)
- [Custom providers](#custom-providers)

## Vercel Flags

Package: `@vercel/flags-core`. Provider: `VercelProvider` of `@vercel/flags-core/openfeature`. `VercelProvider` does not need `@openfeature/server-sdk` at runtime, so you do not install it. With `"skipLibCheck": false` in `tsconfig.json`, install it as a dev dependency for its types.

### Setup

1. Install: `pnpm add flags @vercel/flags-core` plus the framework package.
2. Credentials: `vercel link`, then `vercel env pull`. `VercelProvider` uses the OIDC token of the project. Deployments on Vercel get it automatically.
3. The source: none to create. With `@vercel/flags-core` in `package.json`, the source `self` has the default provider `new VercelProvider()` and no context. Do not write `provider.ts` for it. Add only `flags/sources/self/context.ts` when targeting rules use entities (see [Targeting](#targeting)). The default provider stays. See [flags-files.md](flags-files.md#the-default-source-self).
4. Declare the flags in `app.flags`, e.g. `flag summerSale { defaultValue: false }`. The SDK does not download the flags of the project.
5. Add the framework plugin. Import the flags from `./app.flags` or `flags:self`:
   ```tsx
   import { summerSale } from 'flags:self';

   export default async function Page() {
     const sale = await summerSale();
     return <div>{sale ? 'Summer sale!' : 'Welcome'}</div>;
   }
   ```

Create flags with `vercel flags create <key> --kind <kind> --description "<description>"`, or in the dashboard. Local development evaluates the Development configuration.

### By hand

Without a bundler, or when you prefer code. With a framework plugin and flags files of the source `self`, also set `"selfSource": false` in `flags/config.json`, if the flags files should not use the default provider:

```ts
// flags/self.ts
import { VercelProvider } from '@vercel/flags-core/openfeature';
import { defineSource } from 'flags';

export const self = defineSource({
  provider: new VercelProvider(),
  // The flags of the Vercel project of this deployment
  project: { system: 'vercel-flags' },
  // The entities which your targeting rules use, once per request
  getEvaluationContext: (request) => ({
    user: { id: request?.cookies?.get('user-id')?.value ?? 'anonymous' },
  }),
});
```

```ts
// flags.ts
'use flags';

import { self } from './flags/self';

export const summerSale = self.bindFlag('summerSale', {
  defaultValue: false,
  description: 'Shows the summer sale banner',
});
```

`project: { system: 'vercel-flags' }` gives Flags Explorer the links to the dashboard. The default source `self` of the flags files sets it too.

### Configure the client and SDK keys

`new VercelProvider()` uses the SDK key in `FLAGS` if set, otherwise the OIDC token. To change this, add `flags/sources/self/provider.ts`, and pass a client or an SDK key. It replaces only the default provider:

```ts
// flags/sources/self/provider.ts
import { createClient } from '@vercel/flags-core';
import { VercelProvider } from '@vercel/flags-core/openfeature';

// A client with options
export default new VercelProvider(createClient({ clientName: 'my-app' }));

// Or an SDK key, e.g. for an application outside Vercel:
// export default new VercelProvider(process.env.CUSTOM_FLAGS_KEY!);
```

Use SDK keys for apps outside Vercel, to select an environment explicitly, or for a project of another team. Each SDK key is scoped to one environment, and its value is shown once, at creation. Do not print it.

### The flags of another project

Put each project into its own source. A source other than `self` needs `provider.ts`:

```ts
// flags/sources/shared/provider.ts
import { createClient } from '@vercel/flags-core';
import { VercelProvider } from '@vercel/flags-core/openfeature';

export default new VercelProvider(createClient({ projectId: 'prj_source' }));
```

Declare the flags in a flags file of the source, e.g. `shared.flags` with `source shared`, and import them from the file or from `flags:shared`. By hand, with a `project` for the links of Flags Explorer:

```ts
import { createClient } from '@vercel/flags-core';
import { VercelProvider } from '@vercel/flags-core/openfeature';
import { defineSource } from 'flags';

// A project of the same team, through a Project Connection
export const shared = defineSource({
  provider: new VercelProvider(createClient({ projectId: 'prj_source' })),
  project: { system: 'vercel-flags', projectId: 'prj_source' },
});

// A project of a different team, with an SDK key of that project
export const blog = defineSource({
  provider: new VercelProvider(process.env.BLOG_FLAGS!),
  project: { system: 'vercel-flags', projectId: 'prj_blog', teamId: 'team_acme' },
});
```

The SDK key must belong to the project in `project`. The SDK cannot check this.

### Project Connections

A connection lets a consumer project read the flags of a source project in the same team, with the consumer's OIDC token. Do not create an SDK key for a connection. Requirements: `@vercel/flags-core` 1.11.0 or later, and Vercel CLI 63.0.0 or later for `vercel flags connections`. `projectId` cannot be combined with an SDK key. The consumer's token selects the source environment; custom environments map to preview.

Set up and verify the connection before the app evaluates connected flags. A client whose first request gets a 401 does not retry: the flags return their `defaultValue` (or throw) until the process restarts.

1. Confirm the source project, the consumer project and the team.
2. List the connections: `vercel flags connections list --project <source> --scope <team> --non-interactive`. Reuse an existing one.
3. If the consumer is missing: `vercel flags connections add <consumer> --project <source> --scope <team> --non-interactive`. Run `list` again. Creation needs team Member or Owner, or Project Admin on the source project, and access to the consumer project.
4. In the consumer, run `vercel env pull` for the local OIDC token.
5. Confirm a real read outside the app, e.g. a one-off script with `createClient({ projectId: 'prj_source' }).evaluate('<flag-key>')` of `@vercel/flags-core`, run with `node --env-file=.env.local`. If it fails right after `connections add`, wait briefly and try again.
6. Then add the source folder and a flags file of the source (or `defineSource`), and use the flags.

If a connected flag only returns its default value, check the connection, then restart the dev server or redeploy. Use the `vercel-flags` skill for the full connection workflow.

### Targeting

`VercelProvider` evaluates the rules against what `getEvaluationContext` returns. Return the entities that your rules use:

```ts
// flags/sources/self/context.ts
import type { FlagsRequest } from 'flags';
import { getSession } from '../../../lib/session';

export default async function getEvaluationContext(
  request: FlagsRequest | undefined,
) {
  const session = await getSession(request?.cookies);
  return {
    user: { id: session.userId },
    team: { id: session.teamId },
  };
}
```

- Define the entities and attributes under Flags → Entities in the dashboard first. Return the same names. `user.id` above allows `--by user.id` in `vercel flags split`, `rollout` and `rules add`.
- A rule whose attribute is missing from the context is skipped. A split or rollout without its attribute serves its fallback variant.
- The step runs once per request, also when a page evaluates many flags. Keep it fast: read cookies and headers, and avoid network requests where you can.

### Attribute types

Each attribute is a String, Number, Boolean, String Array or Timestamp. The value must match the type.

- **Timestamp** is a Unix epoch in milliseconds, as a `number` (`Date.now()`, `user.createdAt.getTime()`, `1719792000000`). Do not pass a `Date`, an ISO string or seconds.
- Timestamp rules only compare: after, before, at or after, at or before (`gt`, `lt`, `gte`, `lte`). No equality, one-of or exists.
- Timestamp attributes cannot bucket a split or rollout (`--by`). Use them in rule conditions only.
- To release at a time, pass the current time as `system.time`, and compare against it in a rule. The source step runs once per request, so all flags of a request see the same time:

```ts
// flags/sources/self/context.ts
export default function getEvaluationContext() {
  return {
    system: { time: Date.now() },
    user: { id: 'user-456', signupAt: 1719792000000 },
  };
}
```

### Flags Explorer with Vercel Flags

- Overrides: Flags Explorer sets a cookie that Vercel signs. The SDK verifies it on Vercel and locally after `vercel env pull`. No `FLAGS_SECRET` is needed.
- Dashboard links: with `project: { system: 'vercel-flags' }` (the default source `self` of the flags files sets it).
- Reporting: `VercelProvider` reports evaluations, and reports overrides with a hook.

## OpenFeature providers

### How to use a provider

1. Install `flags`, `@openfeature/server-sdk` (the peer dependency of most providers), and the provider.
2. Export the provider from `flags/sources/self/provider.ts`, or pass it to `defineSource`.
3. Return the context the provider needs from `context.ts`. Most providers use `targetingKey`. The SDK gives no field a special meaning.
4. Declare the flags in `app.flags`.
5. Import the flags from `./app.flags` or `flags:self`.

```ts
// flags/sources/self/context.ts
import type { FlagsRequest } from 'flags';

export default function getEvaluationContext(
  request: FlagsRequest | undefined,
) {
  return {
    targetingKey: request?.cookies?.get('user-id')?.value ?? 'anonymous',
  };
}
```

```js
// app.flags
flag checkout {
  description: "The checkout flow"
  options: ["control", "express"]
  defaultValue: "control"
}
```

By hand, the same provider goes into `defineSource`, and each flag is declared on the source:

```ts
// flags.ts
'use flags';

import { self } from './flags/self';

export const checkout = self.bindFlag('checkout', {
  type: 'string',
  options: ['control', 'express'],
  defaultValue: 'control',
});
```

### Providers that connect at import

Tools import `'use flags'` modules and `provider.ts` to read the flags, e.g. when a build writes the manifest. Creating a provider must not open connections.

- Most providers connect in `initialize()`. They are fine.
- Some connect when you create them: LaunchDarkly (`new LaunchDarklyProvider(...)`), Split (`SplitFactory(...).client()`), CloudBees (`await CloudbeesProvider.build(...)`). Create them once, in a module of their own (`provider.ts` or `flags/<name>.ts`), and check the provider docs for a lazy option.
- Some throw without a key at creation, e.g. the Flagsmith client. Create them lazily, on the first `initialize()` (see [Flagsmith](#flagsmith)).

### LaunchDarkly

```sh
pnpm add flags @openfeature/server-sdk @launchdarkly/node-server-sdk @launchdarkly/openfeature-node-server
```

```ts
// flags/launchdarkly.ts
import { LaunchDarklyProvider } from '@launchdarkly/openfeature-node-server';
import { defineSource } from 'flags';

const projectId = process.env.LAUNCHDARKLY_PROJECT_SLUG;

export const launchdarkly = defineSource({
  // The provider opens its connection to LaunchDarkly when it is created
  provider: new LaunchDarklyProvider(process.env.LAUNCHDARKLY_SDK_KEY ?? ''),
  // The LaunchDarkly project, for the links of Flags Explorer
  project: projectId
    ? {
        system: 'launchdarkly',
        projectId,
        environment: process.env.LAUNCHDARKLY_ENVIRONMENT,
      }
    : undefined,
  // The provider reads `kind` as the context kind, and `targetingKey` as its key
  getEvaluationContext: () => ({ kind: 'user', targetingKey: 'demo-user' }),
});
```

`project.system: 'launchdarkly'` needs `projectId` (the project key). Links to a flag need `environment`. Flags Explorer builds links only for Vercel Flags today.

### GrowthBook

```sh
pnpm add flags @openfeature/server-sdk @growthbook/growthbook @openfeature/growthbook-provider
```

```ts
import { GrowthbookProvider } from '@openfeature/growthbook-provider';
import { defineSource } from 'flags';

const growthbook = defineSource({
  // Loads the features before the first evaluation, and refreshes them every 60 seconds
  provider: new GrowthbookProvider(
    {
      clientKey: process.env.GROWTHBOOK_CLIENT_KEY,
      apiHost: process.env.GROWTHBOOK_API_HOST || 'https://cdn.growthbook.io',
    },
    { pollingInterval: 60_000 },
  ),
  // The provider gives the evaluation context to GrowthBook as attributes
  getEvaluationContext: () => ({ id: 'demo-user' }),
});
```

Add `decryptionKey` to the first argument if feature encryption is on.

### Flagsmith

```sh
pnpm add flags @openfeature/server-sdk @openfeature/flagsmith-provider flagsmith-nodejs
```

`new Flagsmith()` throws without an environment key, and with local evaluation it starts to poll at once. Create the client and the provider lazily. The repository example (`examples/providers/flagsmith/flags/flagsmith.ts`) wraps them:

```ts
import { FlagsmithOpenFeatureProvider } from '@openfeature/flagsmith-provider';
import { defineSource, type EvaluationContext, type Logger, type Provider } from 'flags';
import { Flagsmith } from 'flagsmith-nodejs';

class LazyFlagsmithProvider implements Provider {
  readonly metadata = { name: 'flagsmith-provider' } as const;
  #client: Flagsmith | undefined;
  #provider: FlagsmithOpenFeatureProvider | undefined;

  #getProvider(): FlagsmithOpenFeatureProvider {
    if (!this.#provider) {
      this.#client = new Flagsmith({
        environmentKey: process.env.FLAGSMITH_ENVIRONMENT_KEY ?? '',
        enableLocalEvaluation: true,
      });
      this.#provider = new FlagsmithOpenFeatureProvider(this.#client, {
        // Reads the value of boolean flags instead of the enabled state
        useBooleanConfigValue: true,
      });
    }
    return this.#provider;
  }

  initialize(context?: EvaluationContext) {
    return this.#getProvider().initialize(context);
  }

  async onClose() {
    await this.#client?.close();
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context: EvaluationContext, logger: Logger) {
    return this.#getProvider().resolveBooleanEvaluation(flagKey, defaultValue, context, logger);
  }

  // resolveStringEvaluation, resolveNumberEvaluation and resolveObjectEvaluation forward the same way
}

// To target identities, return a `targetingKey` (the identifier) and `traits`
export const flagsmith = defineSource({ provider: new LazyFlagsmithProvider() });
```

### Statsig

```sh
pnpm add flags @openfeature/server-sdk @statsig/statsig-node-core @flags-sdk/statsig
```

```ts
import { StatsigProvider } from '@flags-sdk/statsig/openfeature';
import { defineSource } from 'flags';

const statsig = defineSource({
  // Creating it does not open a connection: it fetches the rules in initialize()
  provider: new StatsigProvider(process.env.STATSIG_SERVER_API_KEY ?? ''),
  // targetingKey becomes the userID
  getEvaluationContext: () => ({ targetingKey: 'demo-user' }),
});

// The feature gate `showBanner`
export const showBanner = statsig.bindFlag('showBanner', { defaultValue: false });

// The `text` parameter of the dynamic config `welcome_message_text`
export const welcomeMessage = statsig.bindFlag('config:welcome_message_text.text', {
  type: 'string',
  defaultValue: 'Welcome',
});
```

| Key                                   | Reads                                                  |
| ------------------------------------- | ------------------------------------------------------ |
| `my_gate` or `gate:my_gate`           | a feature gate (boolean)                               |
| `config:my_config`                    | the value object of a dynamic config (`type: 'object'`) |
| `experiment:my_experiment`            | the value object of an experiment (`type: 'object'`)   |
| `layer:my_layer.param`                | one parameter of a layer (a layer key needs a parameter) |

- `.<param>` reads one parameter, e.g. `experiment:pricing.price`. String and number flags need a parameter. A missing parameter returns the default value.
- `targetingKey` (or `userID`) becomes `userID`. `email`, `ip`, `userAgent`, `country`, `locale`, `appVersion`, `custom`, `customIDs`, `privateAttributes`, `statsigEnvironment` keep their names. Other primitive attributes go to `custom`.
- `new StatsigProvider(sdkKey, { statsigOptions })`, or `new StatsigProvider(statsig)` with your own instance (initialized, not shut down). `disableExposureLogging: true` turns off exposure logging.
- A key that Statsig rejects (401 or 403) is fatal (`PROVIDER_FATAL`). The SDK does not retry, and the flags return their default values until the process restarts. Network errors are retried on the next evaluation.
- `track` calls `logEvent`.
- Node.js runtime only (native SDK).

### PostHog

```sh
pnpm add flags @openfeature/server-sdk posthog-node @flags-sdk/posthog
```

```ts
import { PostHogProvider } from '@flags-sdk/posthog/openfeature';
import { defineSource } from 'flags';
import { PostHog } from 'posthog-node';

// The application creates the client. The provider does not open a connection itself.
const posthog = new PostHog(process.env.POSTHOG_PROJECT_API_KEY ?? '', {
  host: process.env.POSTHOG_HOST,
  // Optional: local evaluation with a feature flags secret key (phs_...)
  secretKey: process.env.POSTHOG_SECRET_KEY,
});

const source = defineSource({
  provider: new PostHogProvider(posthog),
  // targetingKey is the distinct ID
  getEvaluationContext: () => ({ targetingKey: 'demo-user' }),
});

export const showBanner = source.bindFlag('showBanner', { defaultValue: false });
```

| `type`    | Value                                                                         |
| --------- | ----------------------------------------------------------------------------- |
| `boolean` | Whether the flag is enabled for the user.                                     |
| `string`  | The variant key of a multivariate flag.                                       |
| `number`  | The JSON payload; must be a number, else `TYPE_MISMATCH`.                     |
| `object`  | The JSON payload, any JSON value.                                             |

- `targetingKey` is required (else `TARGETING_KEY_MISSING`). `distinctId` also works.
- `groups`, `personProperties` and `groupProperties` keep their names. Other primitive attributes are person properties.
- Options (second argument): `onlyEvaluateLocally`, `sendFeatureFlagEvents`, `disableGeoip`, `shutdownOnClose` (default `false`).

### Global Config

`GlobalConfigProvider` of `@flags-sdk/global-config/openfeature` reads flags from one item of a Global Config store (formerly Edge Config), by default the item `flags`: `{ "flags": { "summerSale": true } }`.

```sh
pnpm add flags @flags-sdk/global-config
```

```ts
import { GlobalConfigProvider } from '@flags-sdk/global-config/openfeature';
import { defineSource } from 'flags';

export const globalConfig = defineSource({
  provider: new GlobalConfigProvider(), // or { client, itemKey: 'my-flags' }
});
```

- It connects with `GLOBAL_CONFIG` (then `EDGE_CONFIG`) on the first evaluation, not at import.
- A value is the same for every visitor (reason `STATIC`), so the source needs no `getEvaluationContext`.
- An unknown flag returns the `defaultValue` with `FLAG_NOT_FOUND`, a value of another type with `TYPE_MISMATCH`.
- It needs no `@openfeature/server-sdk` at runtime. The v4 `globalConfigAdapter` and `createGlobalConfigAdapter` are removed.

### Other providers

| System             | Package                                             | Provider                                                     |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------ |
| flagd              | `@openfeature/flagd-provider`                       | `new FlagdProvider()`                                        |
| ConfigCat          | `@openfeature/config-cat-provider`                  | `ConfigCatProvider.create('<sdk_key>')`                      |
| Flipt              | `@openfeature/flipt-provider`                       | `new FliptProvider('namespace', { url })`                    |
| GO Feature Flag    | `@openfeature/go-feature-flag-provider`             | `new GoFeatureFlagProvider({ endpoint })`                    |
| AB Tasty           | `@flagship-io/openfeature-provider-js`              | `new ABTastyProvider('<ENV_ID>', '<API_KEY>')`               |
| CloudBees          | `cloudbees-openfeature-provider-node`               | `await CloudbeesProvider.build('<app-key>')` (connects at import) |
| Confidence         | `@spotify-confidence/openfeature-server-provider`   | `createConfidenceServerProvider({ clientSecret, fetchImplementation: fetch, timeout })` |
| DevCycle           | `@devcycle/nodejs-server-sdk`                       | `new DevCycleProvider(process.env.DEVCYCLE_SERVER_SDK_KEY!)` |
| FeatBit            | `@featbit/openfeature-provider-node-server`         | `new FbProvider({ sdkKey, streamingUri, eventsUri })`        |
| Hypertune          | `@hypertune/openfeature-server-provider`            | `new HypertuneProvider({ token })`                           |
| Kameleoon          | `@kameleoon/openfeature-server`                     | `new KameleoonProvider({ siteCode, credentials })`           |
| Split              | `@splitsoftware/openfeature-js-split-provider` + `@splitsoftware/splitio` | `new OpenFeatureSplitProvider({ splitClient })` (the client connects at creation) |
| Tggl               | `openfeature-server-tggl-provider`                  | `new TgglServerProvider(process.env.TGGL_API_KEY!)`          |

Check the provider docs for production options. More: https://openfeature.dev/ecosystem (server-side JavaScript). Full snippets: https://flags-sdk.dev/docs/providers/openfeature

### Reflag

Reflag's OpenFeature provider cannot be bundled (its package has require-only exports). Stay on v4 with `@flags-sdk/reflag` for Reflag (see `examples/providers/reflag`).

## Custom providers

### In-memory providers

For development, tests and demos. `TypedInMemoryProvider` checks the variant types; `InMemoryProvider` does not.

```ts
import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import { defineSource } from 'flags';

export const shop = defineSource({
  provider: new TypedInMemoryProvider({
    summerSale: {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      // On for alice only
      contextEvaluator: (context) => (context.user === 'alice' ? 'on' : 'off'),
    },
    checkout: {
      variants: { control: 'control', express: 'express' },
      defaultVariant: 'express',
      disabled: false,
    },
  } as const),
  project: { system: 'in-memory' },
  getEvaluationContext: (request) => ({
    user: request?.cookies?.get('user')?.value ?? 'anonymous',
  }),
});
```

With flags files: `export default new TypedInMemoryProvider({ ... })` in `provider.ts`, and the same flags in `app.flags`.

### A provider object

Any object with the shape of the `Provider` type of `flags` works. Only `metadata` and `resolveBooleanEvaluation` are required. No base class, no dependency on `@openfeature/server-sdk`.

```ts
import type { EvaluationContext, Provider, ResolutionDetails } from 'flags';

type Values = Record<string, unknown>;

// A provider which loads the flags of each user from a JSON endpoint
export function createJsonProvider(url: string): Provider {
  let values: Record<string, Values> = {};

  function resolve<T>(
    key: string,
    defaultValue: T,
    type: 'boolean' | 'string' | 'number',
    context: EvaluationContext,
  ): ResolutionDetails<T> {
    const user = String(context.targetingKey ?? 'default');
    const flags = values[user] ?? values.default ?? {};
    if (!(key in flags)) {
      return { value: defaultValue, reason: 'ERROR', errorCode: 'FLAG_NOT_FOUND' };
    }
    const value = flags[key];
    if (typeof value !== type) {
      return { value: defaultValue, reason: 'ERROR', errorCode: 'TYPE_MISMATCH' };
    }
    return { value: value as T, reason: 'TARGETING_MATCH' };
  }

  return {
    metadata: { name: 'json-provider' },

    // Called once, before the first evaluation. Not in the constructor:
    // importing a module with this provider must not open connections.
    async initialize() {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`json-provider: Could not load ${url} (${response.status})`);
      }
      values = await response.json();
    },

    async resolveBooleanEvaluation(key, defaultValue, context) {
      return resolve(key, defaultValue, 'boolean', context);
    },
    async resolveStringEvaluation(key, defaultValue, context) {
      return resolve(key, defaultValue, 'string', context);
    },
    async resolveNumberEvaluation(key, defaultValue, context) {
      return resolve(key, defaultValue, 'number', context);
    },
  };
}
```

- `value` becomes the flag value, after the type check. A value outside `options` is still used.
- `errorCode` fails the evaluation: the flag returns its `defaultValue`, or throws a `FlagEvaluationError` with this code. Use OpenFeature codes (`FLAG_NOT_FOUND`, `TYPE_MISMATCH`, `GENERAL`).
- `reason`, `variant` and `flagMetadata` reach the hooks.
- A method that throws fails with `GENERAL`. A missing method for a type fails.
- Optional members: `initialize`, `onClose`, the other resolve methods (`resolveObjectEvaluation` returns any JSON value), `hooks` (also run for overrides), `events`, `track`.

### A reusable OpenFeature provider

For other teams or apps, write a class that implements `Provider` of `@openfeature/server-sdk` (with `metadata`, `runsOn = 'server'`, and the four resolve methods). Rules:

- No I/O in the constructor. Connect in `initialize()`.
- No per-request state in the provider: several sources can share it.
- The context comes complete from the chain.
- Return an `errorCode` for known problems. Throw only for unexpected errors.

Dashboard links for a new system: open a pull request to the SDK with the fields of its projects and the URL of its system manifest.
