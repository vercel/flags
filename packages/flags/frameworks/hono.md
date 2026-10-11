# Flags SDK with Hono

Status: the middleware of `flags/hono` runs each request in
`runtime.onInvoke` and configures the SDK. The script `flags manifest`
writes the manifest of the flags. `tests/standard/hono` tests it with Hono 4
on Node.js, which runs the TypeScript source directly.

## Setup

```ts
import { flags } from 'flags/hono';
import { Hono } from 'hono';
import { config } from './flags.config';

const app = new Hono();
app.use(flags({ config }));
```

- `config` is optional. Hono often runs without a bundler, so the
  configuration is an option of the middleware, not an alias.
- An `HTTPException` passes through the SDK, also from
  `getEvaluationContext`.
- To initialize the providers before the first request, call
  `runtime.onInit()` at startup, and `runtime.onShutdown()` on `SIGTERM`.

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
