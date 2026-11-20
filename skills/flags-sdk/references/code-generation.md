# Code generation (the file system API)

Describe a source in `flags/sources/<source>/`. The SDK writes the `defineSource` and `bindFlag` calls from the catalog of your flag management system. Import each flag by its key:

```ts
import { evaluate } from 'flags';
import { checkout, 'summer-sale' as summerSale } from 'flags:self';

const [sale, flow] = await evaluate([summerSale, checkout]);
```

A new flag in the flag management system becomes a new export, with its type, variants, description and default value. You write no declaration.

## The folder of a source

```text
flags/
  sources/
    self/
      catalog.ts    # The flags of the source, for the generator only
      provider.ts   # The OpenFeature provider
      context.ts    # Optional: getEvaluationContext(request, input)
    marketing/      # Optional: a second source, e.g. a second system
      catalog.ts
      provider.ts
  generated.d.ts    # Generated: the types of flags:self and flags:marketing
.flags/             # Generated, Git ignores it
  self.ts           # The module of flags:self
  marketing.ts      # The module of flags:marketing
```

- The `flags` folder is in the app root or in `src`. In SvelteKit, use `src/flags`.
- The folder name is the source name, and the module is `flags:<name>`. It must start with a letter and contain only letters, digits, `-` and `_`.
- Each source needs `provider.ts` and `catalog.ts`. `context.ts` is optional.

| File                    | Default export                                                       | Runs                                         |
| ----------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| `catalog.ts`            | A `CatalogLoader`: one catalog, or yields a catalog after each change | In Node.js, only when code is generated      |
| `provider.ts`           | The OpenFeature provider                                             | In the app                                   |
| `context.ts` (optional) | `getEvaluationContext(request, input)`                               | In the app                                   |

### `provider.ts`

```ts
import { VercelProvider } from '@vercel/flags-core/openfeature';

export default new VercelProvider();
```

Do not open connections at import. See [providers.md](providers.md#providers-that-connect-at-import).

### `context.ts`

```ts
import type { FlagsRequest } from 'flags';

export default function getEvaluationContext(
  request: FlagsRequest | undefined,
) {
  return { user: request?.cookies?.get('user')?.value ?? 'anonymous' };
}
```

- It runs once per request, for all flags of the source. It may be `async`, and it may import app code, e.g. a session helper.
- A typed second parameter, e.g. `input: { teamId: string }`, makes every flag of the source require that context at each call.
- Without `context.ts`, the provider gets only the context of the call side, and the generated flags take no input.
- Restart the dev server after you add or remove `context.ts`.

### `catalog.ts`

The catalog runs only in the generator, in Node.js with type stripping, without a bundler. The app never imports it, so it may use admin API credentials.

- Use Node.js 22.18 or newer, and only erasable TypeScript syntax (no `enum`).
- Import other files of the source with relative paths, e.g. `import { shopFlags } from './definitions'`. The `.ts` extension is optional (the SDK tries `.ts`, `.tsx` and `/index.ts`; this needs Node.js 22.15 or newer).
- Do not import app code, path aliases (`@/...`) or framework modules.

```ts
interface Catalog {
  flags: {
    [key: string]: {
      variants: unknown[];
      description?: string;
      defaultValue?: unknown; // the value when the evaluation fails
    };
  };
  project?: Project; // as for defineSource, e.g. { system: 'vercel-flags', projectId }
  revision?: number;
}
```

#### Vercel Flags catalog

```ts
export { default } from '@vercel/flags-core/catalog';
```

It streams the flags of the Vercel project. A build takes the first catalog. A dev server stays connected and regenerates after each change. It gives no `defaultValue`. Options: `createCatalogLoader({ sdkKey?, projectId? })`. See [providers.md](providers.md#the-catalog).

#### Static catalog

```ts
import type { CatalogLoader } from 'flags';

const loadCatalog: CatalogLoader = () => ({
  flags: {
    enableSale: {
      variants: [false, true],
      description: 'Shows the summer sale',
      defaultValue: false,
    },
  },
});

export default loadCatalog;
```

#### Streaming catalog

An async generator. Yield a complete catalog first, and again after each change. Stop when `signal` aborts.

```ts
import { setTimeout as sleep } from 'node:timers/promises';
import type { Catalog, CatalogLoadOptions } from 'flags';

async function fetchCatalog(signal: AbortSignal): Promise<Catalog> {
  // The admin API of your flag management system
  const response = await fetch('https://flags.example.com/api/flags', {
    headers: { authorization: `Bearer ${process.env.FLAGS_API_TOKEN}` },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Could not load the flags (${response.status}).`);
  }
  const body = (await response.json()) as {
    flags: { key: string; variants: unknown[]; description?: string; fallback?: unknown }[];
  };
  return {
    flags: Object.fromEntries(
      body.flags.map((flag) => [
        flag.key,
        {
          variants: flag.variants,
          description: flag.description,
          defaultValue: flag.fallback,
        },
      ]),
    ),
  };
}

export default async function* loadCatalog({
  signal,
}: CatalogLoadOptions): AsyncGenerator<Catalog> {
  while (!signal.aborted) {
    yield await fetchCatalog(signal);
    // Check again in 10 seconds
    await sleep(10_000, undefined, { signal }).catch(() => {});
  }
}
```

## What the generator writes

`.flags/<source>.ts`:

- the `'use flags'` directive;
- one `defineSource` with `provider.ts`, `context.ts` (if present) and the `project` of the catalog (if present);
- one `bindFlag` per flag, sorted by key, exported under its key (`export { flag_0 as "summer-sale" }`):
  - `type` from the variants: `boolean`, `string` or `number` if all variants have that type, else `object`;
  - `options`: the variants (they do not limit the value);
  - `description` and `defaultValue`, if the catalog has them;
  - a JSDoc with the description, the variants (at most 10, long ones shortened) and the default value.

`flags/generated.d.ts`, next to `flags/sources`: one `declare module 'flags:<source>'` per source, with a named type per source (e.g. `SelfSource`). TypeScript finds it with its default `include`. No `paths`, no `allowImportingTsExtensions`.

The generator writes a file only when its content changes, never writes half a file, and removes the module of a removed source. If a catalog fails, the last modules stay. `.flags/` has its own `.gitignore` (`*`), plus `aliases.json` for the plugins.

### Import names

A key that is not a valid JavaScript name needs a string import:

```ts
import { 'summer-sale' as summerSale } from 'flags:self';
```

## When code is generated

| Setup                                   | Code generation                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Next.js `withFlags`                     | On by default. `next build` once, `next dev` watches, `next start` nothing.                        |
| SvelteKit / TanStack Start `flags()`    | On by default. `vite build` once, `vite dev` watches.                                              |
| Nuxt module                             | On by default. `nuxt build` once, `nuxt dev` watches.                                              |
| Other Vite setups                       | `flags()` of `@flags-sdk/vite`.                                                                    |
| No bundler (Hono, Express, Node.js)     | Run `flags sync` or `flags watch`, and import `./.flags/self.ts` by its path.                      |

- The dev server generates before it resolves the imports.
- Without a `flags/sources` folder, the plugins write nothing.
- Opt out: `withFlags({}, { disableCodeGeneration: true })`, `flags({ disableCodeGeneration: true })`, `modules: [['@flags-sdk/nuxt', { disableCodeGeneration: true }]]`.
- Restart the dev server after you add or remove a source, or change `provider.ts` or `context.ts`.

### The types in CI

`flags/generated.d.ts` is written again on each dev server start, build and `flags sync`. Either commit it, or run `flags sync` before the type check:

```json
{
  "scripts": {
    "type-check": "flags sync && tsc --noEmit"
  }
}
```

## The CLI

The `flags` package has the `flags` command. No extra install.

```sh
flags sync [dir] [--production]
flags watch [dir] [--production] [-- command ...args]
flags manifest [dir] [--out <file>]
```

- `flags sync`: generates once from the first catalog of each source, then closes the catalogs. Fails if a catalog fails.
- `flags watch`: generates, then again after each catalog change. With `-- command`, it starts the command after the first generation, e.g. `flags watch -- node --watch server.ts`. A change of a source file needs a restart.
- Both load the `.env` files of the directory first, for the catalog credentials: `.env.<mode>.local`, `.env.local`, `.env.<mode>`, `.env`. An earlier file wins, and a variable that is already set wins over all files. The mode is `production` with `--production` or `NODE_ENV=production`, otherwise `development`.
- `flags manifest`: for apps without a framework plugin. Imports the `'use flags'` modules of `dir` with Node.js, loads `flags/config.ts` if found, and writes `flags-manifest.json` (or `--out`). Run it on the `tsc` output or on TypeScript sources with Node.js 22.18 or newer, e.g. `"postbuild": "flags manifest dist"`.

## Default values

A generated flag without a `defaultValue` in its catalog throws a `FlagEvaluationError` when the evaluation fails. The Vercel catalog gives no `defaultValue`. Pick one:

1. **Catch the error** where a fallback makes sense:
   ```ts
   import { FlagEvaluationError } from 'flags';
   import { checkout } from 'flags:self';

   async function checkoutFlow(): Promise<string> {
     try {
       return await checkout();
     } catch (error) {
       if (error instanceof FlagEvaluationError) {
         return 'control';
       }
       throw error;
     }
   }
   ```
2. **Use a static catalog** with `defaultValue` for each flag (see [Static catalog](#static-catalog)).
3. **Write the flag by hand** with `bindFlag({ key, source, defaultValue })` ([providers.md](providers.md#by-hand)).

Rethrow errors that are not a `FlagEvaluationError`, so framework signals pass.

## Catalogs and the runtime

The catalog only shapes the code. At runtime, the provider decides every value:

- A flag added after the deployment has no export until the next generation, e.g. the next build.
- A variant added after the deployment works at once.
- A flag removed from the system disappears at the next generation, so TypeScript shows each call site that still uses it.

## Tests

Unless the test runner uses the framework plugin, generate before the tests and alias `flags:<source>`. See [testing.md](testing.md#with-code-generation).
