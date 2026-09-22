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

## Cache freshness

At runtime on Vercel (`VERCEL=1`), enabling streaming or polling automatically
uses request-header invalidation instead. `initialize()` does not load data,
open a stream, or start polling, so it is safe during the Lambda INIT phase.
Reads lazily load provided/bundled definitions or fetch a datafile.

The `x-vercel-flags-config-versions` header (with `flags-config-versions` as an
alias) supplies a project-specific minimum version. Both evaluation and
`getDatafile()` apply it. Without a usable header, reads serve cached data;
only an empty cache causes a fetch. Outside Vercel, the configured streaming
or polling strategy remains in effect. Disabling both selects offline mode
and disables header refreshes, too.

```ts
const client = createClient({
  staleWhileRevalidate: 60, // seconds; default 60 (1 minute)
  staleIfError: Infinity,  // default: keep available data indefinitely on error
});
```

For header-driven refreshes, freshness is measured from the later of the cached version's successful fetch
and its last accepted matching-header observation, never from `configUpdatedAt`.
Once a newer header version has been observed, older matching headers cannot
renew freshness. Equal or older fetch responses do not renew it either.
Datafiles expose an optional `fetchedAt` timestamp in Unix milliseconds. Network
fetches and generated bundles record their actual fetch completion time;
`getDatafile()` preserves it for serialization and reuse through `datafile`.
Loading provided or bundled definitions never resets this timestamp. Their
freshness is known immediately when `fetchedAt` is present, including after
initialization fails. Older data without a timestamp has unknown freshness
until confirmed or replaced.

When a newer version is required, cached data may be served during
`staleWhileRevalidate` while a background refresh runs. Otherwise the read
blocks. Header refreshes share one transport request at a time, with up to three
attempts, 100ms/200ms backoff, and a ten-second overall deadline per cycle.
Each read waits only for its own version requirement; a newer concurrent read
can trigger a follow-up fetch without delaying an already-satisfied read.

If refreshing fails, `staleIfError` extends the stale-serving window. Its default,
`Infinity`, allows fallback to the last available data indefinitely, including
bundled/provided data with unknown freshness. Refreshes are still attempted;
failure does not replace the cache or reset its age.

A finite value instead limits fallback to `staleWhileRevalidate + staleIfError`
seconds after the last freshness evidence; unknown-age data cannot use a finite
window. For example, `staleWhileRevalidate: 60` with `staleIfError: 3600` permits
fallback for 61 minutes. Setting `staleWhileRevalidate: 0` disables background
stale serving; `staleIfError: 0` adds no extra stale-on-error window.

If no data is available, or an explicitly finite window expires, reads throw.
Evaluation uses a supplied default value or throws when none is provided. Bulk
evaluation throws if any requested flag lacks a default. Shutdown still cancels
pending reads rather than returning stale data.

For regular polling, each successful response confirms freshness, including an
unchanged version. Scheduled polls and reads share in-flight requests. Once SWR
expires, a read starts or joins a blocking poll; failures use the additional
stale-on-error window. Older responses neither replace the cache nor renew its
freshness. Each poll has a ten-second deadline, and scheduled polling continues
after initialization failures.

A connected stream keeps its cache fresh even if the configuration has not
changed for a long time. Disconnection starts the stale window while the stream
reconnects with backoff. After SWR expires, reads share a bounded ten-second wait
for a new datafile or `primed` confirmation. Failed or timed-out reconnections
use the additional stale-on-error window; waiting does not renew freshness.
The stream can continue reconnecting after a read times out.

Polling and streaming measure stale windows from the later of the datafile’s
`fetchedAt` and its latest runtime confirmation.

These rules apply to evaluation, bulk evaluation, and `getDatafile()`. With the
default infinite error window, initialization failures can fall back to bundled
or provided data even before it is confirmed. Build and offline modes do not
expire their cached data.

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
