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
indicate when cached definitions need refreshing. If an evaluation has no version
header (or an empty one), the client permanently switches to streaming when enabled,
otherwise polling. Concurrent evaluations share that startup and later headers do
not switch the client back. A present but malformed or unrelated header keeps the
existing cached-read behavior, fetching only when the cache is empty.

```ts
const client = createClient(process.env.FLAGS!, {
  vercel: true,
  staleWhileRevalidate: 10, // Seconds of background-refresh grace.
  staleIfError: 60, // Seconds of cached fallback after a refresh failure.
});
```

`staleWhileRevalidate` defaults to 10 seconds and accepts finite, nonnegative values,
including fractions. `0` makes refreshes block. The window starts at the latest
accepted fetch or valid confirmation, including an equal-version fetch response.
The cache tracks this age independently of `fetchedAt`. Bundled/provided definitions
preserve their original `fetchedAt`; unknown or expired cache age requires a blocking
refresh when a newer request version arrives. Refresh failures use `staleIfError`.
A newer-header read attempts blocking recovery after that failure allowance expires.

`getDatafile()` remains a snapshot read: it applies stale-if-error but does not inspect
headers. Use `vercel: false` to select the existing stream/poll behavior. Disabling both
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
stream close or ping timeout records `stream: disconnected` if no earlier failure
exists. `getFallbackDatafile()` remains an independent bundled-data export.

Polling data is marked stale after the polling interval; streaming data after 30
seconds. Accepted updates and valid confirmations reset cache age without rewriting
`fetchedAt`. Stream pings also reset age and clear any failure.
Age alone does not prevent stream/poll reads or trigger extra requests. Source scheduling,
retries, timeouts, and build/offline behavior remain unchanged. Poll errors feed the
shared failure handler without logging each failed poll. An initialization timeout
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

### Client debug logging

Set `DEBUG=@vercel/flags-core` to enable detailed diagnostics. This reuses the
existing ingest debug switch:

```sh
DEBUG=@vercel/flags-core pnpm dev
```

Client diagnostics use `console.debug` with the `@vercel/flags-core` prefix and
an object containing an `event` and its diagnostic details. The controller, cache,
and network sources all use the same global logging function. For example:

```text
@vercel/flags-core { event: 'client.state', from: 'idle', to: 'vercel', hasData: true }
@vercel/flags-core { event: 'cache.freshness', status: 'expired', revision: 42, ageMs: 15000, ... }
@vercel/flags-core { event: 'cache.refresh.blocking', ... }
```

Events cover initialization and shutdown, selected modes and state transitions,
read/snapshot results, cache versions and age, version acceptance/confirmation,
header timestamps, background/blocking/shared refreshes, stale-if-error expiry,
HTTP response status, polling, stream pings, timeouts, and reconnect delays.
Cache ages and delays are in milliseconds; `Infinity` denotes unknown age or an
unlimited stale-if-error window. The new client diagnostics omit credentials,
raw headers, flag definitions, evaluation entities, and raw error messages.

Logging is off by default. The logger checks `DEBUG` on each call; removing the
namespace disables client diagnostics, including for existing clients. Diagnostics
are verbose, including an event for each read, and event names/fields are internal
rather than a stable API. Configure your log collector to include `console.debug` output.
