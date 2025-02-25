# Flags SDK — Statsig Provider

The [Statsig provider](https://flags-sdk.dev/docs/api-reference/adapters/statsig) for the [Flags SDK](https://flags-sdk.dev/) contains support for Statsig's Feature Gates, Dynamic Config, Experiments, Autotune and Layers.

## Setup

The Statsig provider is available in the `@flags-sdk/statsig` module. You can install it with

```bash
pnpm i @flags-sdk/statsig
```

## Provider Instance

You can import the default adapter instance `statigAdapter` from `@flags-sdk/statsig`:

```ts
import { statsigAdapter } from '@flags-sdk/statsig';
```

## Example

```ts
import { flag } from 'flags/next';
import { statsigAdapter } from '@flags-sdk/statsig';

export const marketingGate = flag<boolean>({
  key: 'marketing_gate',
  adapter: statsigAdapter.featureGate((config) => config.value),
});
```

## Documentation

Please check out the [Statsig provider documentation](https://flags-sdk.dev/docs/api-reference/adapters/statsig) for more information.
