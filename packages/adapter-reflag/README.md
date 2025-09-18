# Flags SDK - Reflag Provider

The [Reflag provider](https://flags-sdk.dev/docs/api-reference/adapters/reflag) for the [Flags SDK](https://flags-sdk.dev/) contains support for Reflag's feature flags.

## Setup

The Reflag provider is available in the `@flags-sdk/reflag` module. You can install it with

```bash
pnpm i @flags-sdk/reflag
```

## Provider Instance

You can import the default adapter instance `reflagAdapter` from `@flags-sdk/reflag`:

```ts
import { reflagAdapter } from '@flags-sdk/reflag';
```

## Example

```ts
import { flag } from 'flags/next';
import { reflagAdapter } from '@flags-sdk/reflag';

export const huddleFlag = flag<boolean>({
  key: 'huddle',
  adapter: reflagAdapter.featureIsEnabled(),
});
```

## Documentation

Please check out the [Reflag provider documentation](https://flags-sdk.dev/docs/api-reference/adapters/reflag) for more information.
