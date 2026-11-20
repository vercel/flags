# @flags-sdk/hono

The Hono middleware of the [Flags SDK](../flags). It runs each request in
`runtime.onInvoke`, so that the flags get the request, and it configures the
SDK.

```ts
app.use(flags());
```

## Features

- **One middleware.** Each request runs in the scope of the SDK, also after
  an `await` in a handler.
- **`flags/config.ts` as an option.** Hono often runs without a bundler,
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
import { bannerText, summerSale } from './flags';

const app = new Hono();
app.use(flags());

app.get('/', async (c) => {
  const [sale, banner] = await evaluate([summerSale, bannerText]);
  return c.json({ sale, banner });
});
```

### 2️⃣ Optional: `flags/config.ts`

You do not need a configuration file: each flag names its source, and
overrides work with `FLAGS_SECRET`, or on Vercel, without one. Add
`flags/config.ts` (or `src/flags/config.ts`), next to `flags/sources`, for
settings of all flags: OpenFeature `hooks`, and the options of `overrides`.
It has no source. Without a bundler, nothing loads it: pass it to the
middleware, `app.use(flags({ config }))`.

```ts
// flags/config.ts
import { defineConfig } from 'flags';

export const config = defineConfig({
  hooks: [myLoggingHook],
});
```

## Sources and code generation

There is no bundler, so there is no plugin for code generation. Each flag
names its source. Use one of two ways:

- Write `defineSource` and `bindFlag` by hand.
- Put each source into `flags/sources/<source>` (`catalog.ts`,
  `provider.ts` and `context.ts`). By convention, the main source of the
  application is `flags/sources/self`. Run `flags sync` (one time) or
  `flags watch` (after each change of a catalog), and import the generated
  module:

  ```ts
  import { 'summer-sale' as summerSale } from './.flags/self.ts';
  ```

## Discovery

```sh
flags manifest [dir] [--out <file>]
```

- It imports the modules which start with `'use flags'` in `dir` with
  Node.js, and writes `flags-manifest.json`. It loads `flags/config.ts` if
  it finds one.
- Run it on the source if Node.js can run it (TypeScript with type
  stripping, Node.js 22.18 or newer), or on the output of `tsc`, which
  keeps the directive. A bundled output loses the directive.
- Without a bundler, nothing appends the self-registration. Call
  `registerFlags` by hand if a module has plain flag objects with a
  source.

## License

MIT
