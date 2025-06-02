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

export const summerBannerFlag = feature<boolean>({
  key: 'summer-banner',
  adapter: growthBookAdapter.feature(),
});
```

## Experimentation (A/B Testing)

In order to run GrowthBook experiments, you must define a back-end tracking callback function. This is called every time a user is put into an experiment and can be used to track the exposure event in your analytics system. We recommend defining this callback in your flag definition file (e.g. `flags.ts`).

```ts
import { after } from 'next/server';

growthbookAdapter.setTrackingCallback((experiment, result) => {
  // Safely fire and forget async calls (Next.js)
  after(async () => {
    console.log('Viewed Experiment', {
      experimentId: experiment.key,
      variationId: result.key,
    });
  });
});
```

In some situations, you may prefer to use a front-end tracking callback. This requires a bit of implementation glue. See the Vercel [Next.js + GrowthBook example](https://github.com/vercel/examples/tree/main/flags-sdk/growthbook) for details.

### Sticky Bucketing

To implement sticky bucketing (required for Bandits), you may create any `StickyBucketService` instance and apply it to the adapter (recommended in `flags.ts`). We recommend using our Redis service for ease of implementation.

```ts
import { RedisStickyBucketService } from '@growthbook/growthbook';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_CONNECTION_URL);
const redisStickyBucketService = new RedisStickyBucketService({ redis });

growthbookAdapter.setStickyBucketService(redisStickyBucketService);
```

## Documentation

Please check out the [GrowthBook provider documentation](https://flags-sdk.dev/docs/api-reference/adapters/growthbook) for more information.
