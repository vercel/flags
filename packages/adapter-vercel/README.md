# `@flags-sdk/vercel`

The [Vercel adapter](https://flags-sdk.dev/providers/vercel) for the [Flags SDK](https://flags-sdk.dev/) connects your feature flags to [Vercel Flags](https://vercel.com/docs/flags/vercel-flags), the feature flag platform built into Vercel. Manage flags, define targeting rules, roll out gradually, and run experiments directly from the Vercel Dashboard.

## Installation

```bash
npm i flags @flags-sdk/vercel @vercel/flags-core
```

## Usage

```ts
import { flag } from 'flags/next';
import { vercelAdapter } from '@flags-sdk/vercel';

export const exampleFlag = flag({
  key: 'example-flag',
  adapter: vercelAdapter(),
});
```

## Documentation

- [Getting Started with Vercel Flags](https://vercel.com/docs/flags/vercel-flags/quickstart)
- [Vercel Flags](https://vercel.com/docs/flags/vercel-flags)
- [@flags-sdk/vercel](https://flags-sdk.dev/providers/vercel)
- [Flags SDK](https://flags-sdk.dev/)
