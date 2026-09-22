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

## Cache freshness on Vercel

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
  staleIfError: 3600,       // additional seconds; default 3600 (1 hour)
});
```

Freshness is measured from the later of the cached version's successful fetch
and its last accepted matching-header observation, never from `configUpdatedAt`.
Once a newer header version has been observed, older matching headers cannot
renew freshness. Equal or older fetch responses do not renew it either.
Provided/bundled definitions have unknown freshness until confirmed or replaced.

When a newer version is required, cached data may be served during
`staleWhileRevalidate` while a background refresh runs. Otherwise the read
blocks. Refreshes share one transport request at a time, with up to three
attempts, 100ms/200ms backoff, and a ten-second overall deadline per cycle.
Each read waits only for its own version requirement; a newer concurrent read
can trigger a follow-up fetch without delaying an already-satisfied read.

If retries fail, `staleIfError` extends the stale-serving window. In the example,
stale data is eligible for background refresh for 60 seconds, and may be served
on refresh failure until 3,660 seconds (61 minutes) after its last accepted freshness evidence.
Unknown-age data cannot use either window. Setting `staleWhileRevalidate: 0`
disables background stale serving; setting `staleIfError: 0` adds no extra
stale-on-error window beyond it. After expiry, reads throw; evaluation uses a
supplied default value or throws when none is provided. Bulk evaluation throws
if any requested flag lacks a default.

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
