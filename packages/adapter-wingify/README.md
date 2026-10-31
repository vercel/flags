# Flags SDK — Wingify Provider

The [Wingify provider](https://flags-sdk.dev/providers/wingify) for the [Flags SDK](https://flags-sdk.dev/) evaluates Wingify Feature Management flags and variables.

## Setup

```bash
npm i @flags-sdk/wingify
```

Set the required environment variables:

```sh
export WINGIFY_ACCOUNT_ID="your-account-id"
export WINGIFY_SDK_KEY="your-sdk-key"
```

## Usage

```ts
import { flag } from 'flags/next';
import { wingifyAdapter } from '@flags-sdk/wingify';

export const checkoutV2 = flag<boolean>({
  key: 'checkout-v2',
  defaultValue: false,
  adapter: wingifyAdapter.variation(),
  identify: ({ headers }) => ({
    id: headers.get('x-user-id') ?? 'anonymous',
  }),
});
```

## Documentation

See the [Wingify provider documentation](https://flags-sdk.dev/providers/wingify).
