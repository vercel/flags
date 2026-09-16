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

### Initialization and request-scoped OIDC

On Vercel, the OIDC token can be supplied through the current request context (`x-vercel-oidc-token`). It is not guaranteed to be available while modules are loading. Creating the client at module scope is safe, but starting `client.initialize()` there can attempt authentication before a request exists.

Do not store a module-scope initialization promise and await it later in a handler. Calling `initialize()` starts the work immediately; awaiting the promise inside a request does not move that work into the request context. If the promise rejects, every handler awaiting that same promise will reject before reaching evaluation and its fallback handling.

This also applies when definitions are embedded at build time: with OIDC authentication, the client uses the token's `project_id` claim to select the embedded definitions. An importable `@vercel/flags-definitions` module alone is not enough.

For local development, `vercel env pull` writes an OIDC token to `.env.local`. If your local runner loads that file, the environment-variable fallback can make module-scope initialization appear to work, even though request-scoped authentication on a deployment requires deferring it.

Explicit `await client.initialize()` is optional and can be useful when you want to wait for initialization and handle its errors yourself. Only call it once authentication is available: inside a request handler for request-scoped OIDC, or during startup when using an SDK key or an already-available environment token. For normal flag evaluation, prefer calling `evaluate()` or `bulkEvaluate()` directly in the handler.

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

## Configuration version headers

The header source reads `x-vercel-flags-config-versions` or `flags-config-versions`,
with the `x-vercel-` header taking precedence when both are present.

## Initialization performance benchmark

From this repository, run the network-free scenario matrix:

```bash
pnpm --filter @vercel/flags-core bench:init
pnpm --filter @vercel/flags-core bench:init --definitions /path/to/datafile.json --samples 20
```

Use `--json` for unrounded phase medians/p95s and path-validation counters. Without a file, the benchmark uses 31 synthetic flags. A supplied file stays local and is not modified; generated copies are removed when the run completes. Project metadata is normalized to synthetic values while preserving the flag and segment payloads.

Each auth method (SDK key and request-scoped OIDC) is measured with:

- Embedded definitions only, with stream/polling disabled.
- Embedded definitions and a matching, fresh version header, with streaming enabled to verify that the header bypasses it.
- Embedded definitions and a mocked stream sending a `primed` response.
- No matching embedded entry and a mocked stream sending a full datafile.

Every cold sample uses a fresh Node process. A second, new client in that process measures warm module, parsed-definition, SDK-key-hash, and OIDC-helper caches. Repeated `initialize()` on the same client is reported separately as `reinit`. There are no timing thresholds: assertions verify paths, authentication, memoization, and stream cancellation rather than machine speed.

The probes measure `createClient()` separately from `initialize()`, then break initialization into embedded module import, auth/project lookup, SDK-key hashing/cache lookup, embedded `JSON.parse`, header detection, stream initialization, and remaining work. JSON output additionally includes total bundled loading and stream authentication; these are **inclusive** parent/child measurements, not additional time to sum. The main table's phase columns are exclusive, but their separately computed medians need not sum to the median init time.

The benchmark bundles the current source into a temporary worker and adds probes only to that build. The real controller, embedded loader, OIDC helper, hash implementation, generated definitions, and stream decoder run; only stream transport and credentials are synthetic. Mock response construction, fixture preparation, SDK module loading, validation, and shutdown are outside the measured init interval. Instrumentation has some overhead. No live network latency or Next.js `use cache` wrapper is measured, so these numbers are diagnostic breakdowns rather than deployed latency predictions.

Run the benchmark's functional tests with:

```bash
pnpm --filter @vercel/flags-core exec vitest run bench/init.test.ts
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
