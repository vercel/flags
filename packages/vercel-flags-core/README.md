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

## Header-driven reads on Vercel

When `VERCEL=1`, the client defaults to `vercel: true`. Initialization loads provided
or bundled definitions without starting a stream or polling. Request version headers
indicate when cached definitions need refreshing. Header mode requires a valid positive
version for the client’s own `projectId`. Missing, empty, malformed, or unrelated entries
permanently switch that client to streaming when enabled, otherwise polling. Clients
with different projects select their sources independently within the same request.
Concurrent reads share that startup and later headers do
not switch the client back. Pending HTTP refreshes remain shared until the stream
delivers current data or confirms the cached version. That confirmation cancels the
superseded refresh, and waiting reads use the confirmed cache; late responses cannot
change cache or authorization state. With an empty cache, the first read uses a shared
fetch to load definitions and discover the client’s project. The next read assesses
that project’s header entry and starts the stream/poll fallback if it is unavailable.
If the cold fetch fails, the client starts fallback immediately.

```ts
const client = createClient(process.env.FLAGS!, {
  vercel: true,
  staleWhileRevalidate: 10, // Seconds of background-refresh grace.
  staleIfError: 60, // Seconds of cached fallback after a refresh failure.
});
```

`staleWhileRevalidate` defaults to 10 seconds and accepts finite, nonnegative values,
including fractions. `0` makes header-driven refreshes block. The window starts at the latest
accepted fetch or valid confirmation, including an equal-version fetch response.
The cache tracks this age independently of `fetchedAt`. Bundled/provided definitions
preserve their original `fetchedAt`; unknown or expired cache age requires a blocking
refresh when a newer request version arrives. Refresh failures use `staleIfError`.
A newer-header read attempts blocking recovery after that failure allowance expires.

`getDatafile()` uses the same lazy initialization and resolution path as evaluations,
including header checks, background revalidation, blocking refresh, stale-if-error, and
source fallback. Concurrent calls share HTTP refreshes across both APIs.
Use `vercel: false` to select the stream/poll behavior. Disabling both
stream and polling still selects offline mode, and builds retain their existing loading.

## Cached reads after errors

`staleIfError` controls how many seconds evaluations and `getDatafile()` may use
cached flag definitions after a stream/poll/header-refresh failure or stream disconnect:

```ts
const client = createClient(process.env.FLAGS!, {
  staleIfError: 60,
});
```

The default is `Infinity`, preserving unlimited cached fallback. Use a finite
nonnegative number of seconds to bound fallback. Fractional seconds are supported
(for example, `0.5` allows 500 milliseconds). A positive window includes its exact
deadline; `0` disables cached fallback immediately after failure.
Negative values, `NaN`, and negative infinity throw when creating the client.

The allowance starts at the first consecutive failure. Repeated errors,
disconnects, and provided or bundled fallback data do not renew it. An accepted
source update, or a finite equal version for the same project and environment,
clears the outage. A stream `primed` message also clears it when its finite numeric
revision and identity match the cached entry. Pings clear failures too: the server
sends `primed` or a datafile before pings on each connection. Opening a connection
alone does not clear a failure. A later failure starts a new allowance.
Responses are observed in completion order, with existing version acceptance.

After expiry, `evaluate()` returns the caller's default with reason `error`, or
throws the first failure when no default is supplied. `bulkEvaluate()` returns
an error result for each requested flag, with its default value when provided.
`getDatafile()` follows the same allowance and throws after expiry. The entry is
retained for recovery, including its revision for stream reconnection. A clean
stream close records `stream: disconnected` if no earlier failure exists. Ping timeouts
reconnect quietly without recording a failure or starting polling, including after runtime
suspension. Genuine disconnections start an immediate background poll, sharing pending
read refreshes, then continue at the configured interval. Stream recovery stops polling. `getFallbackDatafile()` remains an independent bundled-data export.

Streaming data becomes stale after 60 seconds and expires after 90 seconds, allowing
one missed 30-second ping before revalidation and matching the stream's ping
timeout. Polling data becomes stale after its interval plus the 10-second fetch
deadline, and expires after two intervals plus that deadline (40 and 70 seconds with
the default 30-second interval). These windows are independent of `staleWhileRevalidate`.
Stale evaluations and `getDatafile()` calls refresh in the background; expired reads
wait for the shared refresh. Refresh failures still follow `staleIfError`.

Accepted updates and valid confirmations reset cache age without rewriting `fetchedAt`.
Stream pings also reset age and clear any failure. Poll errors feed the shared failure
handler without logging each failed poll. An initialization timeout alone does not
start the failure allowance or reset cache age. It permits cached fallback while
the pending update continues; polling intervals remain active after startup timeout.

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
