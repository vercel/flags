# @flags-sdk/hono

The Hono middleware of the [Flags SDK](../flags). It runs each request in
`runtime.onInvoke`, so that the flags get the request, and it configures the
SDK.

```ts
app.use(flags({ config }));
```

## Features

- **One middleware.** Each request runs in the scope of the SDK, also after
  an `await` in a handler.
- **`flags.config.ts` as an option.** Hono often runs without a bundler,
  so the configuration is an option, not an alias.
- **Errors pass through.** An `HTTPException` reaches Hono unchanged, also
  from `getEvaluationContext`.

## Installation

```sh
pnpm add flags @flags-sdk/hono
```

Your code imports only `flags`. `@flags-sdk/hono` is only for the setup.

## Setup

### 1️⃣ Add the middleware

```ts
import { flags } from '@flags-sdk/hono';
import { evaluate } from 'flags';
import { Hono } from 'hono';
import { config } from './flags.config';
import { bannerText, summerSale } from './flags';

const app = new Hono();
app.use(flags({ config }));

app.get('/', async (c) => {
  const [sale, banner] = await evaluate([summerSale, bannerText]);
  return c.json({ sale, banner });
});
```

### 2️⃣ `flags.config.ts`

Flags without a source use the default source of the configuration. For
now, without a configuration, the built-in default source throws. Without
a bundler, a platform can not replace the default provider. Give the
middleware a configuration, e.g. with the provider of Vercel Flags:

```sh
pnpm add @vercel/flags-core @openfeature/server-sdk
```

```ts
// src/flags.config.ts
import { VercelProvider } from '@vercel/flags-core/openfeature';
import { defineConfig, defineSource } from 'flags';

export const config = defineConfig({
  defaultSource: defineSource({
    provider: new VercelProvider(),
    project: { system: 'vercel-flags' },
    getEvaluationContext: (_context, request) => ({
      user: request?.cookies?.get('user')?.value ?? 'anonymous',
    }),
  }),
});

// Gives flags without a source the types of this source
declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
```

Any other OpenFeature provider works in the same way.

### Notes

- `config` is optional.
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
  it finds one, for the default source.
- Run it on the source if Node.js can run it (TypeScript with type
  stripping, Node.js 22.18 or newer), or on the output of `tsc`, which
  keeps the directive. A bundled output loses the directive.
- Without a bundler, nothing appends the self-registration. Call
  `registerFlags` by hand if a module has plain flag objects with a
  source.

## License

MIT
