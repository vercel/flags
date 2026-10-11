# Flags SDK with Hono

Status: the runtime works with `runtime.onInvoke` in a middleware. Hono
often runs without a bundler, so the script `flags manifest` writes the
manifest of the flags. `tests/standard/hono` tests it with Hono 4 on
Node.js, which runs the TypeScript source directly.

## Setup

```ts
import { runtime } from 'flags';
import { Hono } from 'hono';

const app = new Hono();
app.use((c, next) => runtime.onInvoke(c.req.raw, next));
```

## Discovery

```sh
flags manifest [dir] [--out <file>]
```

- It imports the modules which start with `'use flags'` in `dir` with
  Node.js, and writes `flags-manifest.json`.
- Run it on the source if Node.js can run it (TypeScript with type
  stripping, Node.js 22.18 or newer), or on the output of `tsc`, which
  keeps the directive. A bundled output loses the directive.
- Without a bundler, nothing appends the self-registration. Call
  `registerFlags` by hand if a module has plain flag objects with a
  connection.
