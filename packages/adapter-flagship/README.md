# Flags SDK — Flagship Provider

The [Flagship provider](https://flags-sdk.dev/docs/api-reference/adapters/flagship) for the [Flags SDK](https://flags-sdk.dev/) contains support for Flagship's feature flags and experimentation capabilities.

## Setup

The Flagship provider is available in the `@flags-sdk/flagship` module. You can install it with:

```bash
npm i @flags-sdk/flagship
```

## Provider Instance

You can import the default adapter instance from `@flags-sdk/flagship`:

```ts
import { flagshipAdapter } from '@flags-sdk/flagship';
```

The default adapter uses the following environment variables:

```sh
# Required for all modes
FLAGSHIP_ENV_ID="YOUR_ENV_ID"
FLAGSHIP_API_KEY="YOUR_API_KEY"

# Optional configuration
FLAGSHIP_DECISION_MODE="0" # 0=DECISION_API (default), 1=BUCKETING, 2=BUCKETING_EDGE
FLAGSHIP_LOG_LEVEL="2" # Valid values: 0-9 (defaults to INFO level)

# Required only when using Edge mode (FLAGSHIP_DECISION_MODE=2)
EDGE_CONFIG="https://edge-config.vercel.com/ecfg_abdc1234?token=xxx-xxx-xxx"
EDGE_CONFIG_ITEM_KEY="flagship_bucketing"
```

## Example

```typescript
import { flag, dedupe } from 'flags/next';
import { Identify } from 'flags';
import { flagshipAdapter, type NewVisitor } from '@flags-sdk/flagship';

const identify = dedupe((async () => {
  return {
    visitorId: 'visitor-id-12345',
    hasConsented: true,
  };
}) satisfies Identify<NewVisitor>);

export const showBannerFlag = flag<boolean, NewVisitor>({
  key: 'show_promotion_banner',
  defaultValue: false,
  identify,
  adapter: flagshipAdapter.getFlag(),
});
```

## Edge Bucketing Mode

Flagship supports a bucketing mode that can improve performance by loading campaign data from Edge Config:

```typescript
// Set these environment variables before importing flagshipAdapter
// FLAGSHIP_DECISION_MODE=2
// EDGE_CONFIG=https://edge-config.vercel.com/ecfg_abdc1234?token=xxx-xxx-xxx
// EDGE_CONFIG_ITEM_KEY=flagship_bucketing

import { flag, dedupe } from 'flags/next';
import { Identify } from 'flags';
import { flagshipAdapter, type NewVisitor } from '@flags-sdk/flagship';

const identify = dedupe((async () => {
  return {
    visitorId: 'visitor-id-12345',
    hasConsented: true,
  };
}) satisfies Identify<NewVisitor>);

export const showPromotionBanner = flag<boolean, NewVisitor>({
  key: 'show_promotion_banner',
  defaultValue: false,
  identify,
  adapter: flagshipAdapter.getFlag(),
});
```

## Custom Adapter

Create a custom adapter using the `createFlagshipAdapter` function:

```typescript
import {
  createFlagshipAdapter,
  DecisionMode,
  type NewVisitor,
} from '@flags-sdk/flagship';
import { flag, dedupe } from 'flags/next';
import { Identify } from 'flags';

const customAdapter = createFlagshipAdapter({
  envId: 'YOUR_ENV_ID',
  apiKey: 'YOUR_API_KEY',
  config: {
    decisionMode: DecisionMode.BUCKETING_EDGE,
    connectionString: process.env.EDGE_CONFIG,
    edgeConfigItemKey: 'flagship_bucketing',
  },
});

const identify = dedupe((async () => {
  return {
    visitorId: 'visitor-id-12345',
    hasConsented: true,
  };
}) satisfies Identify<NewVisitor>);

export const featureFlag = flag<boolean, NewVisitor>({
  key: 'feature-flag',
  defaultValue: false,
  identify,
  adapter: customAdapter.getFlag(),
});
```

## Documentation

Please check out the [Flagship provider documentation](https://flags-sdk.dev/docs/api-reference/adapters/flagship) for more information.
