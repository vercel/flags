# Flags SDK - Bucket Provider

The [Bucket provider](https://flags-sdk.dev/docs/api-reference/adapters/bucket) for the [Flags SDK](https://flags-sdk.dev/) contains support for Bucket's feature flags.

## Setup

The Bucket provider is available in the `@flags-sdk/bucket` module. You can install it with

```bash
pnpm i @flags-sdk/bucket
```

## Provider Instance

You can import the default adapter instance `bucketAdapter` from `@flags-sdk/bucket`:

```ts
import { bucketAdapter } from '@flags-sdk/bucket';
```

## Example

```ts
import { flag } from 'flags/next';
import { bucketAdapter } from '@flags-sdk/bucket';

export const huddleFlag = flag<boolean>({
  key: 'huddle',
  adapter: bucketAdapter.featureIsEnabled(),
});
```

## Documentation

Please check out the [Bucket provider documentation](https://flags-sdk.dev/docs/api-reference/adapters/bucket) for more information.
