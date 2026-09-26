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
# Settings > Project > Project secret API keys (feature_flag:read scope)
POSTHOG_PROJECT_SECRET_API_KEY=phs_...
# Alternatively: Settings > User > Personal API keys (feature_flag:read scope)
# POSTHOG_PERSONAL_API_KEY=phx_...
# Settings > Project > Project ID
POSTHOG_PROJECT_ID=521742
```

## Flags Explorer metadata

`getProviderData` supports either a project secret API key or a personal API key.
Existing personal-key calls continue to use the paginated management API:

```ts
import { getProviderData } from "@flags-sdk/posthog";

await getProviderData({
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
  projectId: process.env.POSTHOG_PROJECT_ID!,
});
```

To use a project-scoped key with `feature_flag:read`, select the definitions API:

```ts
await getProviderData({
  projectSecretApiKey: process.env.POSTHOG_PROJECT_SECRET_API_KEY!,
  projectId: process.env.POSTHOG_PROJECT_ID!,
});
```

Both modes read `POSTHOG_HOST` by default. `appHost` overrides the dashboard host;
project-key mode also accepts `apiHost` to override the ingestion host. The project
ID supplies dashboard links in project-key mode; authentication needs only the key.
Definitions include descriptions (`name`), boolean or multivariate options, and
payload options. As before, nonempty payloads take precedence over flag values.
Creation timestamps are available only from the personal-key management API.

## Evaluation modes

- **Remote (default):** with only `POSTHOG_PROJECT_API_KEY` and `POSTHOG_HOST`
  set, each evaluation calls PostHog. No background polling; request volume scales
  with traffic. Recommended for serverless.
- **Local:** set `POSTHOG_SECRET_KEY` (`phs_...`) to opt in. `posthog-node` polls flag
  definitions (~30s) and evaluates in-process for lower latency. Polling runs **per
  warm server process** and counts against your PostHog feature flag request quota
  regardless of user traffic.

`POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_SECRET_API_KEY` are used only by the
Flags Explorer (`getProviderData`) and do not enable local evaluation.

## Runtimes

| Runtime      | Supported |
| ------------ | --------- |
| Node         | ✅        |
| Edge Runtime | ❌        |

Note: `posthog-node` does not support the Edge Runtime.

To use with Routing Middleware and precompute, read more: [Middleware now supports Node.js](https://vercel.com/changelog/middleware-now-supports-node-js)

## Documentation

View more PostHog documentation at [posthog.com](https://posthog.com?utm_source=github&utm_campaign=flags_sdk).
