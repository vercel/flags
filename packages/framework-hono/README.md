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
- **The configuration as an option.** Hono often runs without a bundler,
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
import { Hono } from 'hono';
import { bannerText, summerSale } from './flags';

const app = new Hono();
app.use(flags());

app.get('/', async (c) => {
  const sale = await summerSale();
  const banner = await bannerText();
  return c.json({ sale, banner });
});
```

### 2️⃣ Optional: the configuration files

You do not need a configuration file: each flag is declared on its source, and
overrides work with `FLAGS_SECRET`, or on Vercel, without one. The folder
`flags` (or `src/flags`), next to `flags/sources`, can have one file for each
part of the configuration of all flags:

- `flags/hooks.ts`: the OpenFeature hooks for all flags, as the default
  export.
- `flags/config.json`: the static settings, e.g. `"selfSource": false`, or
  `overrides`: which override cookies the SDK accepts.

Without a bundler, nothing loads the files. Import them, and pass them
to the middleware:

```ts
// flags/hooks.ts
import type { Hook } from 'flags';

const hooks: Hook[] = [myLoggingHook];

export default hooks;
```

```ts
import settings from './flags/config.json' with { type: 'json' };
import hooks from './flags/hooks';

app.use(flags({ config: { hooks, settings } }));
```

`flags sync`, `flags watch` and `flags manifest` read `flags/config.json`.
The middleware reads it only when you pass it as `settings`, e.g. for the
setting `overrides`. See
[Configuration](https://flags-sdk.dev/docs/flags/configuration).

## Sources and code generation

There is no bundler, so there is no plugin for code generation. Each flag
is declared on its source. Use one of two ways:

- Write `defineSource` and `source.bindFlag` by hand.
- Put each source into `flags/sources/<source>` (`catalog.ts`,
  `provider.ts`, and an optional `context.ts` and `hooks.ts`). By convention, the main source of the
  application is `flags/sources/self`. Run `flags sync` (one time) or
  `flags watch` (after each change of a catalog), and import the generated
  module:

  ```ts
  import { summerSale } from './.flags/self.ts';
  ```

## Discovery

```sh
flags manifest [dir] [--out <file>]
```

- It imports the modules which start with `'use flags'` in `dir` with
  Node.js, and writes `flags-manifest.json`. It loads `flags/hooks.ts`
  and `flags/config.json` if it finds them.
- Run it on the source if Node.js can run it (TypeScript with type
  stripping, Node.js 22.18 or newer), or on the output of `tsc`, which
  keeps the directive. A bundled output loses the directive.
- Without a bundler, nothing appends the self-registration. Call
  `registerFlags` of `flags/runtime` by hand if a module has plain flag objects with a
  source.

## License

MIT
