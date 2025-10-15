# Flags SDK — Hypertune Provider

The [Hypertune adapter](https://flags-sdk.dev/docs/api-reference/adapters/hypertune) for the [Flags SDK](https://flags-sdk.dev/)

## Setup

The Hypertune provider is available in the `@flags-sdk/hypertune` module. You can install it with

```bash
pnpm i @flags-sdk/hypertune
```

## Provider Instance

You must use the code generation powered by `npx hypertune` to create an adapter instance.
Use `createHypertuneAdapter` from `@flags-sdk/hypertune` as shown below:

```ts
import { createHypertuneAdapter } from "@flags-sdk/hypertune";
import { Identify } from "flags";
import { dedupe, flag } from "flags/next";
/** Generated with `npx hypertune` */
import {
  createSource,
  flagFallbacks,
  vercelFlagDefinitions as flagDefinitions,
  Context,
  FlagValues,
} from "./generated/hypertune";

const identify: Identify<Context> = dedupe(async ({ headers, cookies }) => {
  return {
    environment: process.env.NODE_ENV,
    user: {
      id: "e23cc9a8-0287-40aa-8500-6802df91e56a",
      name: "Example User",
      email: "user@example.com",
    },
  };
});

const hypertuneAdapter = createHypertuneAdapter<FlagValues, Context>({
  createSource,
  flagFallbacks,
  flagDefinitions,
  identify,
});

/** Use the adapter to generate flag declarations for use in your app's framework */
export const showSummerBannerFlag = flag(
  hypertuneAdapter.declarations.summerSale,
);

export const showFreeDeliveryBannerFlag = flag(
  hypertuneAdapter.declarations.freeDelivery,
);

export const proceedToCheckoutColorFlag = flag(
  hypertuneAdapter.declarations.proceedToCheckout,
);

/**
 * NOTE: You can provide specific options for flag overrides.
 *
 * However, using enums in Hypertune will provide these automatically.
 */
export const delayFlag = flag({
  ...hypertuneAdapter.declarations.delay,
  options: [
    { value: 0, label: "No delay" },
    { value: 1_000, label: "1 second" },
    { value: 2_000, label: "2 seconds" },
    { value: 3_000, label: "3 seconds" },
  ],
});
```

## Required Environment Variables

```bash
# Required
NEXT_PUBLIC_HYPERTUNE_TOKEN="123="

# For use with precompute, encrypted flag values, overrides, and the Flags Explorer
FLAGS_SECRET="ReplaceThisWith32RandomBytesBase64UrlString"

# Optional: automatically configure with a VercelEdgeConfigInitDataProvider
EXPERIMENTATION_CONFIG="ecfg_abc"
EXPERIMENTATION_CONFIG_ITEM_KEY="hypertune_xyz"
```

## Documentation

Please check out the [Hypertune Adapter reference](https://flags-sdk.dev/docs/api-reference/adapters/hypertune) for more information.
