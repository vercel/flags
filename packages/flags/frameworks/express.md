# Flags SDK with Express

Status: the middleware of `flags/express` runs each request in
`runtime.onInvoke` and configures the SDK. `tests/standard/express` tests it
with Express 5 on Node.js, which runs the TypeScript source directly.

## Setup

```ts
import express from 'express';
import { evaluate } from 'flags';
import { flags } from 'flags/express';
import { config } from './flags.config';
import { newCheckout } from './flags';

const app = express();
app.use(flags({ config }));

app.get('/', async (_request, response) => {
  response.json({ checkout: await newCheckout() });
});
```

- `config` is optional, e.g. the export `config` of `flags.config.ts`.
- The middleware converts the Node.js headers into Web `Headers`, and
  builds the URL from the `Host` header and `originalUrl`.
- The handlers after the middleware run in the scope of the request, also
  after an `await`.
- To initialize the providers before the first request, call
  `runtime.onInit()` at startup, and `runtime.onShutdown()` on `SIGTERM`.

## Discovery

Run `flags manifest` after the build, as for Hono (see `hono.md`).
