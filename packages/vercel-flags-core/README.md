# `@vercel/flags-core`

The core evaluation engine for [Vercel Flags](https://vercel.com/docs/flags/vercel-flags), the feature flag platform built into Vercel. This package provides direct access to the flag evaluation client, data fetching, and an [OpenFeature](https://openfeature.dev/) provider.

For Next.js and SvelteKit applications, use the [Flags SDK](https://flags-sdk.dev/) with [`@flags-sdk/vercel`](https://flags-sdk.dev/providers/vercel) provider instead. Use `@vercel/flags-core` when you need lower-level control, are working with an unsupported framework, or want to use the OpenFeature standard.

## Installation

```bash
npm i @vercel/flags-core
```

## Usage

```ts
import { createClient } from '@vercel/flags-core';

const client = createClient(process.env.FLAGS!);

await client.initialize();

const result = await client.evaluate<boolean>('show-new-feature', false, {
  user: { id: 'user-123' },
});
```

## Experiment exposures

Experiment-backed flag evaluations report exposures automatically. Provide a
custom reporter to send them to your analytics system:

```ts
const client = createClient(process.env.FLAGS!, {
  reportExposures: async (exposures, entity) => {
    await analytics.reportExposures(exposures, entity);
  },
});
```

`evaluate()` reports at most one exposure. `bulkEvaluate()` reports all
experiment exposures in one callback with the single entity object shared by
the evaluations. The default reporter currently maps exposures to the Vercel
Web Analytics shape and logs them through a temporary console-backed tracker.

Disable exposure logging for an evaluation when evaluating speculatively or
prefetching:

```ts
const result = await client.evaluate(
  'show-new-feature',
  false,
  { user: { key: 'user-123' } },
  { exposureLogging: false },
);
```

The same option is supported by `bulkEvaluate()`:

```ts
await client.bulkEvaluate(
  [{ key: 'show-new-feature', defaultValue: false }],
  { user: { key: 'user-123' } },
  { exposureLogging: false },
);
```

## OpenFeature

An OpenFeature-compatible provider is available at `@vercel/flags-core/openfeature`:

```ts
import { OpenFeature } from '@openfeature/server-sdk';
import { VercelProvider } from '@vercel/flags-core/openfeature';

await OpenFeature.setProviderAndWait(new VercelProvider());
const client = OpenFeature.getClient();
```

## Documentation

- [Core Library Docs](https://vercel.com/docs/flags/vercel-flags/sdks/core)
- [OpenFeature Provider Docs](https://vercel.com/docs/flags/vercel-flags/sdks/openfeature)
- [Vercel Flags](https://vercel.com/docs/flags/vercel-flags)
