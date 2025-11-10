# Flags SDK - Flagsmith Provider

The [Flagsmith provider](https://flags-sdk.dev/docs/api-reference/adapters/flagsmith) for the [Flags SDK](https://flags-sdk.dev/) contains support for Flagsmith's Feature Flags and Remote Configuration.

## Setup

The Flagsmith provider is available in the `@flags-sdk/flagsmith` module. You can install it with

```bash
npm i @flags-sdk/flagsmith
```

Set the required environment variable:

```sh
export FLAGSMITH_ENVIRONMENT_ID="your-environment-id"
```

## Usage

The Flagsmith adapter provides a `getValue()` method with optional type coercion:

```ts
import { flag } from "flags/next";
import { flagsmithAdapter } from "@flags-sdk/flagsmith";

// No coercion - returns the raw value from Flagsmith
export const rawFlag = flag({
  key: "raw-value",
  defaultValue: "default",
  adapter: flagsmithAdapter.getValue(),
});

// Coerce to string type
export const buttonColor = flag<string>({
  key: "button-color",
  defaultValue: "blue",
  adapter: flagsmithAdapter.getValue({ coerce: "string" }),
});

// Coerce to number type
export const maxItems = flag<number>({
  key: "max-items",
  defaultValue: 10,
  adapter: flagsmithAdapter.getValue({ coerce: "number" }),
});

// Coerce to boolean type
export const showBanner = flag<boolean>({
  key: "show-banner",
  defaultValue: false,
  adapter: flagsmithAdapter.getValue({ coerce: "boolean" }),
});
```

### Type Coercion Behavior

- **Without `coerce`**: Returns the raw value from Flagsmith (empty/null/undefined values return default)
- **`coerce: "string"`**: Converts any value to string (returns default for null/undefined/NaN)
- **`coerce: "number"`**: Converts strings to numbers (returns default if result is NaN or invalid)
- **`coerce: "boolean"`**:
  - Converts `"true"`/`"false"` strings (case-insensitive) to boolean
  - Converts `0` to `false` and `1` to `true`
  - Falls back to the flag's enabled state for other values
  - Returns default when flag is disabled

## Custom Adapter

Create a custom adapter by using the `createFlagsmithAdapter` function:

```ts
import { createFlagsmithAdapter, EntitiesType } from "@flags-sdk/flagsmith";

const identify: Identify<EntitiesType> = dedupe(async () => {
  return {
    targetingKey: "user",
    traits: {
      id: "e23cc9a8-0287-40aa-8500-6802df91e56a",
      name: "John Doe",
      email: "johndoe@flagsmith.com",
    },
  };
});

const adapter = createFlagsmithAdapter({
  environmentID: "your-environment-id",
  // Additional Flagsmith config options
});

export const showBanner = flag<boolean, EntitiesType>({
  key: "show-banner",
  identify,
  adapter: adapter.getValue({ coerce: "boolean" }),
});
```

## Flags Discovery Endpoint

To enable the [Flags Explorer](https://vercel.com/docs/feature-flags/flags-explorer), create a discovery endpoint at `app/.well-known/vercel/flags/route.ts`:

```ts
import { createFlagsDiscoveryEndpoint } from "flags/next";
import { getProviderData } from "@flags-sdk/flagsmith";

export const GET = createFlagsDiscoveryEndpoint(async () => {
  return getProviderData({
    environmentKey: process.env.FLAGSMITH_ENVIRONMENT_ID,
    projectId: process.env.FLAGSMITH_PROJECT_ID,
  });
});
```

This endpoint fetches flag definitions directly from Flagsmith's API and returns them to the Flags Explorer.

## Environment Variables

- `FLAGSMITH_ENVIRONMENT_ID` (required): Your Flagsmith environment ID
- `FLAGSMITH_PROJECT_ID` (optional): Required for the Flags Discovery Endpoint

## Documentation

Please check out the [Flagsmith provider documentation](https://flags-sdk.dev/providers/flagsmith) for more information.

## License

MIT
