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

### Custom `waitUntil`

By default, the client uses `waitUntil` from `@vercel/functions` to keep
background work alive after a response. When Next.js selects the `next-js`
conditional export, the client uses `after` from `next/server` instead. You can
still pass a custom platform-specific implementation to `createClient`:

```ts
import { createClient } from '@vercel/flags-core';
const client = createClient(process.env.FLAGS!, {
  waitUntil: (promise) => platformContext.waitUntil(promise),
});
```

Evaluation does not wait for usage or exposure reporting. On platforms with a
request lifecycle, pass its `waitUntil` implementation so that background work
can finish after the response. In long-lived or self-hosted processes, call and
await `client.shutdown()` during graceful shutdown to drain pending work.

Abrupt process termination and permanent network failures cannot guarantee
delivery. Use a durable queue when reporting must survive those failures.

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
