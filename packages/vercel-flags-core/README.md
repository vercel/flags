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
or bundled definitions. At module scope it starts no network activity. Called inside a
request, `initialize()` also prepares the cache for that request the way its first
evaluation would: a matching version header confirms the cache, a newer version or an
empty cache fetches, and a missing entry starts streaming or polling. It resolves once
that work settles and rejects only when no definitions are available. Calling it again
in later requests repeats the preparation without setting the client up twice. Request version headers
indicate when cached definitions need refreshing. Header mode requires a valid positive
version for the client’s own `projectId`. An evaluation whose request carries a missing,
empty, malformed, or unrelated entry permanently switches that client to streaming when
enabled, otherwise polling. Clients also switch when cached definitions have no valid
positive config version to compare. Clients with different projects select their sources
independently within the same request. Concurrent reads share that startup and later
headers do not switch the client back. Pending HTTP refreshes remain shared until the
stream delivers current data or confirms the cached version. That confirmation cancels the
superseded refresh, and waiting reads use the confirmed cache; late responses cannot
change cache or authorization state. With an empty cache, the first read uses a shared
fetch to load definitions and discover the client’s project. The next evaluation assesses
that project’s header entry and starts the stream/poll fallback if it is unavailable.
If the cold fetch fails, the read rejects without switching sources, and the next read
retries it. Fetch failures use cached data only while stale-if-error permits it; source
assessment errors start fallback.

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

`getDatafile()` is a snapshot: it never starts streaming or polling. It serves cached
definitions through the same header checks, background revalidation, blocking refresh,
and stale-if-error as evaluations, shares pending HTTP refreshes with them, and loads
bundled definitions or performs a one-time fetch when the cache is empty. Only
evaluations switch a client to streaming or polling.
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
disconnects, and provided or bundled fallback data do not renew it. Any successful
source response clears the outage: a newer datafile replaces the cached one, while
an equal, older, or differently identified response proves the source is reachable
and leaves the stored definitions in place. A stream `primed` message clears it when
its finite numeric revision and identity match the cached entry. Pings clear failures
too: the server sends `primed` or a datafile before pings on each connection. Opening
a connection alone does not clear a failure. A later failure starts a new allowance.
Responses are observed in completion order, with existing version acceptance.

After expiry, `evaluate()` returns the caller's default with reason `error`, or
throws the first failure when no default is supplied. `bulkEvaluate()` returns
an error result for each requested flag, with its default value when provided.
`getDatafile()` follows the same allowance and throws after expiry. The entry is
retained for recovery, including its revision for stream reconnection. A clean
stream close records `stream: disconnected` if no earlier failure exists, and the
stream reconnects on its own with backoff while reads keep serving the cache. A
routine reconnect takes about a second, so keep `staleIfError` above the reconnect
delay; `0` or sub-second values fail reads during every reconnect. Ping timeouts
reconnect quietly without recording a failure, including after runtime suspension.

Streaming and polling never run at the same time. Polling starts only once the stream
has given up for good: its retry budget is exhausted, it receives a 401, or its token
cannot be resolved. A stream startup timeout keeps connecting in the background without
polling. Whenever polling starts, reads wait for the first poll or `polling.initTimeoutMs`;
on timeout, reads follow `staleIfError` while polling continues at the configured
interval. A zero initialization timeout waits for the poll, which still has a ten-second
fetch deadline. Polling gives up on a 401 as well. Whenever no live source is active,
because the stream is reconnecting or the stream or polling gave up, reads apply plain
stale-while-revalidate over HTTP: data refreshed within `staleWhileRevalidate` is served
as is, older data is served while a background refresh runs, and data older than
`staleWhileRevalidate` plus `staleIfError` waits for the refresh. Data without a known
age refreshes in the background. `getFallbackDatafile()` remains an independent
bundled-data export.

**Cached definitions now age.** Streaming data is fresh for 60 seconds after
the last message, allowing one missed 30-second ping. Polling data is fresh for its
interval plus the 10-second fetch deadline (40 seconds with the default 30-second
interval). After that, polling data is stale for `staleWhileRevalidate` seconds (10 by
default) and then expired: stale reads refresh over HTTP in the background, and expired
reads wait for the shared fetch. Streaming reads never wait and start no HTTP work
while the stream is live: older data is served immediately and reported as stale. The
stream recovers on its own. Its ping watchdog reconnects a connection that has been
silent for 90 seconds, including right after a runtime resumes from a suspension, and
the reconnect's first message confirms or replaces the cache. A stream that keeps failing
gives up and hands over to polling or HTTP revalidation.
`staleWhileRevalidate: 0` makes polling reads block as soon as the fresh window ends. Data
without a known age, such as a provided datafile without `fetchedAt`, is served until the
active source first confirms it; without a live source it is revalidated like stale data.
Refresh failures still follow `staleIfError`.

Accepted updates, source responses, and valid confirmations reset cache age without
rewriting `fetchedAt`. Stream pings also reset age and clear any failure. Poll errors
feed the shared failure handler without logging each failed poll. An initialization
timeout alone does not start the failure allowance or reset cache age; it permits
cached fallback while the pending update continues. Shutting down and reinitializing
a client starts with a clean cache and failure deadline.

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
