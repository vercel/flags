# Flags SDK — PostHog Adapter

The PostHog adapter for [Flags SDK](https://flags-sdk.dev/) supports dynamic server side feature flags powered by [PostHog](https://posthog.com/).

## Setup

Install the adapter

```bash
pnpm i @flags-sdk/posthog
```

## Example Usage

```ts
import { flag } from 'flags/next';
import { postHogAdapter } from '@flags-sdk/posthog';

export const marketingGate = flag<boolean>({
  // The key in PostHog
  key: 'my_posthog_flag_key_here',
  // The PostHog feature to use (isFeatureEnabled, featureFlagValue, featureFlagPayload)
  adapter: postHogAdapter.featureFlagValue(),
});
```

## Runtimes

| Runtime      | Supported |
| ------------ | --------- |
| Node         | ✅        |
| Edge Runtime | ❌        |

Note: `posthog-node` does not support the Edge Runtime.

To use with middleware and precompute, read more: [Middleware now supports Node.js](https://vercel.com/changelog/middleware-now-supports-node-js)

## Documentation

View more PostHog documentation at [posthog.com](https://posthog.com?utm_source=github&utm_campaign=flags_sdk).
