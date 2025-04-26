# Flags SDK — GrowthBook Provider

The [GrowthBook provider](https://flags-sdk.dev/docs/api-reference/adapters/growthbook) for the [Flags SDK](https://flags-sdk.dev/) contains support for GrowthBook's Feature Flags and Experiments.

## Setup

The GrowthBook provider is available in the `@flags-sdk/growthbook` module. You can install it with

```bash
pnpm i @flags-sdk/growthbook
```

## Provider Instance

You can import the default adapter instance `growthbookAdapter` from `@flags-sdk/growthbook`:

```ts
import { growthBookAdapter } from '@flags-sdk/growthbook';
```

## Example

```ts
import { flag } from 'flags/next';
import { growthBookAdapter } from '@flags-sdk/growthbook';

export const sumerBannerFlag = flag<boolean>({
  key: 'summer-banner',
  adapter: growthBookAdapter.featureGate((config) => config.value),
});
```

## Documentation

Please check out the [GrowthBook provider documentation](https://flags-sdk.dev/docs/api-reference/adapters/growthbook) for more information.
