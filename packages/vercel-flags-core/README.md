# `@vercel/flags-core`

The core evaluation engine for [Vercel Flags](https://vercel.com/docs/flags/vercel-flags), the feature flag platform built into Vercel. This package provides direct access to the flag evaluation client, data fetching, and an [OpenFeature](https://openfeature.dev/) provider.

For Next.js and SvelteKit applications, use the [Flags SDK](https://flags-sdk.dev/) with [`@flags-sdk/vercel`](https://flags-sdk.dev/providers/vercel) provider instead. Use `@vercel/flags-core` when you need lower-level control, are working with an unsupported framework, or want to use the OpenFeature standard.

## Installation

```bash
npm i @vercel/flags-core
```

## Usage

Create a shared client at module scope, but evaluate flags inside a request handler when using Vercel OIDC authentication. `evaluate()` and `bulkEvaluate()` initialize the client automatically on first use; you do not need to call `initialize()` first.

For example, in an Express app deployed to Vercel:

```ts
import express from 'express';
import { createClient } from '@vercel/flags-core';

const app = express();
const client = createClient(); // Uses Vercel OIDC; does not initialize yet.

app.get('/api/feature', async (_req, res) => {
  const result = await client.evaluate<boolean>('show-new-feature', false);
  res.json({ enabled: result.value });
});

export default app;
```

Outside Vercel, pass an SDK key explicitly: `createClient(process.env.FLAGS)`.

## Cached runtime evaluations

`staleIfErrorMs` controls how long streaming and polling evaluations may use
cached definitions after the active source fails:

```ts
const client = createClient(process.env.FLAGS!, {
  staleIfErrorMs: 60_000,
});
```

The default is `Infinity`, preserving unlimited cached fallback. Use a finite
nonnegative number of milliseconds to bound fallback. A positive window includes
its exact deadline; `0` disables cached fallback immediately after a source error
or stream disconnect. Negative values, `NaN`, and negative infinity throw when
creating the client.

A stream or polling source is assumed to keep its cached snapshot current until
it fails. The first consecutive failure freezes that confirmation time. Repeated
errors and provided or bundled fallback data do not renew it. Accepted source data,
a finite equal version for the same project/environment, or a stream `primed`
message matching the cached revision and project/environment clears the outage.
A later failure starts a new allowance. Responses retain their existing completion
order and version acceptance rules.

After expiry, `evaluate()` returns the caller's default with reason `error`, or
throws the first source error when no default is supplied. `bulkEvaluate()` returns
an error result for each requested flag, with its default value when provided.
The cached snapshot is retained: `getDatafile()` can still return it after expiry.
Reads do not start an extra refresh because the allowance expired.

Build and offline read policies, source scheduling, and metrics categories are
unchanged. An initialization timeout alone does not start the allowance; source
failure evidence must occur. Existing startup limitations remain: when initial
polling times out, no recurring interval is started, even if that in-flight request
later completes.

## Evaluation Metrics

To associate evaluation metrics with an environment, pass the
`metricEnvironment` option:

```ts
const client = createClient(process.env.FLAGS!, {
  metricEnvironment: 'preview',
});
```

This option is sent only to the metrics ingestion endpoint. It does not select
the environment used for flag evaluation.

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
