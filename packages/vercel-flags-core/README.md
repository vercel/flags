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

## Cached stream and polling reads

`staleIfErrorMs` controls how long evaluations and `getDatafile()` may use cached
flag definitions after a stream/poll failure or stream disconnect:

```ts
const client = createClient(process.env.FLAGS!, {
  staleIfErrorMs: 60_000,
});
```

The default is `Infinity`, preserving unlimited cached fallback. Use a finite
nonnegative number of milliseconds to bound fallback. A positive window includes
its exact deadline; `0` disables cached fallback immediately after failure.
Negative values, `NaN`, and negative infinity throw when creating the client.

The allowance starts at the first consecutive failure. Repeated errors,
disconnects, and provided or bundled fallback data do not renew it. An accepted
source update, or a finite equal version for the same project and environment,
clears the outage. A stream `primed` message also clears it when its finite numeric
revision and identity match the cached entry. Opening a connection or receiving
a ping alone does not clear a failure. A later failure starts a new allowance.
Responses are observed in completion order, with existing version acceptance.

After expiry, `evaluate()` returns the caller's default with reason `error`, or
throws the first failure when no default is supplied. `bulkEvaluate()` returns
an error result for each requested flag, with its default value when provided.
`getDatafile()` follows the same allowance and throws after expiry. The entry is
retained for recovery, including its revision for stream reconnection. A clean
stream close or ping timeout records `stream: disconnected` if no earlier failure
exists. `getFallbackDatafile()` remains an independent bundled-data export.

There is no age-based expiry while the source is healthy, and reads do not trigger
an extra refresh after expiry. Build/offline behavior, source scheduling, retries,
timeouts, metrics categories, and logging are unchanged. An initialization timeout
alone does not start the allowance. Existing startup limitations remain: when
initial polling times out, no recurring interval is started, even if that in-flight
request later completes.

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
