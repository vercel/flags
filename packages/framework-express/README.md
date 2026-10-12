# @flags-sdk/express

The Express middleware of the [Flags SDK](../flags). It runs each request in
`runtime.onInvoke`, so that the flags get the request, and it configures the
SDK.

```ts
app.use(flags({ config }));
```

## Features

- **One middleware.** Each request runs in the scope of the SDK, also after
  an `await` in a handler.
- **`flags.config.ts` as an option.** Express often runs without a bundler,
  so the configuration is an option, not an alias.

## Installation

```sh
pnpm add flags @flags-sdk/express
```

Your code imports only `flags`. `@flags-sdk/express` is only for the setup.

## Setup

### 1️⃣ Add the middleware

```ts
import { flags } from '@flags-sdk/express';
import express from 'express';
import { config } from './flags.config';
import { newCheckout } from './flags';

const app = express();
app.use(flags({ config }));

app.get('/', async (_request, response) => {
  response.json({ checkout: await newCheckout() });
});
```

### 2️⃣ Optional: `flags.config.ts`

Without a configuration, flags use Vercel Flags through OFREP, with the
OIDC token of the project (locally from `vercel env pull`). Without a
bundler, a platform can not replace the default provider, so OFREP sends
one request for each evaluation, also on Vercel. For fast evaluations, give
the middleware a configuration with the provider of Vercel Flags:

```sh
pnpm add @vercel/flags-core @openfeature/server-sdk
```

```ts
// src/flags.config.ts
import { VercelProvider } from '@vercel/flags-core/openfeature';
import { defineConfig, defineConnection } from 'flags';

export const config = defineConfig({
  defaultConnection: defineConnection({
    provider: new VercelProvider(),
    project: { system: 'vercel-flags' },
    getEvaluationContext: (_context, request) => ({
      user: request?.cookies?.get('user')?.value ?? 'anonymous',
    }),
  }),
});

// Gives flags without a connection the types of this connection
declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
```

Any other OpenFeature provider works in the same way.

### Notes

- `config` is optional.
- The middleware converts the Node.js headers into Web `Headers`, and builds
  the URL from the `Host` header and `originalUrl`.
- To initialize the providers before the first request, call
  `runtime.onInit()` at startup, and `runtime.onShutdown()` on `SIGTERM`.

See the [Flags SDK](../flags) for flags, the evaluation context, overrides,
hooks and tracking.

## Discovery

```sh
flags manifest [dir] [--out <file>]
```

- It imports the modules which start with `'use flags'` in `dir` with
  Node.js, and writes `flags-manifest.json`. It loads `flags.config.ts` if
  it finds one, for the default connection.
- Run it on the source if Node.js can run it (TypeScript with type
  stripping, Node.js 22.18 or newer), or on the output of `tsc`, which
  keeps the directive. A bundled output loses the directive.
- Without a bundler, nothing appends the self-registration. Call
  `registerFlags` by hand if a module has plain flag objects with a
  connection.

## License

MIT
