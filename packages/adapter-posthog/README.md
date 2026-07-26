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
  adapter: postHogAdapter,
});
```

## Environment variables

Always required, read by `postHogAdapter`:

```bash
# Regional API host, determines where your data lives
POSTHOG_HOST=https://us.i.posthog.com # or https://eu.i.posthog.com
# Settings > Project > Project API Key
POSTHOG_PROJECT_API_KEY=phc_...
```

Optional, opts `postHogAdapter` into local evaluation:

```bash
# Settings > Project > Feature flags secret key
POSTHOG_SECRET_KEY=phs_...
```

For the Flags Explorer, read by `getProviderData` only:

```bash
# Settings > User > Personal API keys
POSTHOG_PERSONAL_API_KEY=phx_...
# Settings > Project > Project ID
POSTHOG_PROJECT_ID=521742
```

## Evaluation modes

- **Remote (default):** with only `POSTHOG_PROJECT_API_KEY` and `POSTHOG_HOST`
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
