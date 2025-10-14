# Flags SDK - Flagsmith Provider

The [Flagsmith provider](https://flags-sdk.dev/docs/api-reference/adapters/flagsmith) for the [Flags SDK](https://flags-sdk.dev/) contains support for Flagsmith's Feature Flags and Remote Configuration.

## Setup

The Flagsmith provider is available in the `@flags-sdk/flagsmith` module. You can install it with

```bash
npm i @flags-sdk/flagsmith
```

## Provider Instance

You can import the default adapter instance `flagsmithAdapter` from `@flags-sdk/flagsmith`:

```ts
import { flagsmithAdapter } from '@flags-sdk/flagsmith';
```

## Configuration

The adapter automatically initializes Flagsmith with the following configuration:

- `environmentId`: From `FLAGSMITH_ENVIRONMENT_ID` environment variable

```sh
export FLAGSMITH_ENVIRONMENT_ID="your-environment-id"
```

## Example

```ts
import { flag } from 'flags/next';
import { flagsmithAdapter } from '@flags-sdk/flagsmith';

// Boolean flags
export const showBanner = flag<boolean>({
  key: 'show-banner',
  adapter: flagsmithAdapter.booleanValue(),
});

// String flags
export const buttonColor = flag<string>({
  key: 'button-color',
  defaultValue: 'blue',
  adapter: flagsmithAdapter.stringValue(),
});

// Number flags
export const maxItems = flag<number>({
  key: 'max-items',
  defaultValue: 10,
  adapter: flagsmithAdapter.numberValue(),
});
```

## Custom Adapter

Create a custom adapter by using the `createFlagsmithAdapter` function:

```ts
import { createFlagsmithAdapter } from '@flags-sdk/flagsmith';

const adapter = createFlagsmithAdapter({
  environmentID: 'your-environment-id',
  // Additional Flagsmith config options
});
```

## Flags Discovery Endpoint

To enable the [Flags Explorer](https://vercel.com/docs/feature-flags/flags-explorer), create a discovery endpoint at `app/.well-known/vercel/flags/route.ts`:

```ts
import { createFlagsDiscoveryEndpoint } from 'flags/next';
import { getProviderData } from '@flags-sdk/flagsmith';

export const GET = createFlagsDiscoveryEndpoint(async () => {
  return getProviderData({
    environmentKey: process.env.FLAGSMITH_ENVIRONMENT_ID,
    projectId: process.env.FLAGSMITH_PROJECT_ID,
  });
});
```

This endpoint fetches flag definitions directly from Flagsmith's API and returns them to the Flags Explorer. You'll need to set the `FLAGSMITH_PROJECT_ID` environment variable in addition to `FLAGSMITH_ENVIRONMENT_ID`.

## Features

- **Type-safe flag definitions**: Each method returns a properly typed adapter
- **Automatic initialization**: Flagsmith client can be lazily initialized
- **Identity support**: Full support for Flagsmith identity and traits
- **Default value handling**: Proper fallback to default values when flags are disabled or not found
- **Boolean flag**: Boolean flags use the `value` if it is of boolean type or the `enabled` state directly

## Environment Variables

- `FLAGSMITH_ENVIRONMENT_ID` (required): Your Flagsmith environment ID
- `FLAGSMITH_PROJECT_ID` (optional): Required for the Flags Discovery Endpoint

## Documentation

Please check out the [Flagsmith provider documentation](https://flags-sdk.dev/providers/flagsmith) for more information.

## License

MIT
