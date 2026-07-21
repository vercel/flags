# Flags SDK — PostHog Adapter

The PostHog adapter for [Flags SDK](https://flags-sdk.dev/) supports dynamic server side feature flags powered by [PostHog](https://posthog.com/).

## Setup

Install the adapter

```bash
pnpm i @flags-sdk/posthog
```

## Example Usage

```ts
import { flag } from "flags/next";
import { postHogAdapter } from "@flags-sdk/posthog";

export const marketingGate = flag<boolean>({
  // The key in PostHog
  key: "my_posthog_flag_key_here",
  // The PostHog feature to use (isFeatureEnabled, featureFlagValue, featureFlagPayload)
  adapter: postHogAdapter.featureFlagValue(),
});
```

## Evaluation modes

The mode is an explicit choice, not a side effect of any other credential.

- **Remote (default):** with only `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`
  set, each evaluation calls PostHog. No background polling; request volume scales
  with traffic. Recommended for serverless.
- **Local:** set `POSTHOG_SECRET_KEY` (`phs_...`) to opt in. `posthog-node` polls flag
  definitions (~30s) and evaluates in-process for lower latency. Polling runs **per
  warm server process** and counts against your PostHog feature flag request quota
  regardless of user traffic.

`POSTHOG_PERSONAL_API_KEY` is used only by the Flags Explorer (`getProviderData`) and
does not enable local evaluation.

## Runtimes

| Runtime      | Supported |
| ------------ | --------- |
| Node         | ✅        |
| Edge Runtime | ❌        |

Note: `posthog-node` does not support the Edge Runtime.

To use with Routing Middleware and precompute, read more: [Middleware now supports Node.js](https://vercel.com/changelog/middleware-now-supports-node-js)

## Documentation

View more PostHog documentation at [posthog.com](https://posthog.com?utm_source=github&utm_campaign=flags_sdk).
