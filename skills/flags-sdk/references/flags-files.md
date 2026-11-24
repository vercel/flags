# Flags files and `flags:<source>`

A flags file (`*.flags`) declares the flags of the app. By convention, the main file is `app.flags` in the app root (SvelteKit: `src/app.flags`). Import each flag from its file, or from its source:

```js
// app.flags
source self

flag summerSale {
  key: "summer-sale"
  description: "Shows the summer sale banner"
  defaultValue: false
}

flag checkout {
  options: ["control", { value: "express", label: "Express checkout" }]
  defaultValue: "control"
}
```

```ts
import { checkout, summerSale } from './app.flags';
// or, the same flags:
import { checkout, summerSale } from 'flags:self';

const sale = await summerSale();
const flow = await checkout(); // 'control' | 'express' | (string & {})
```

- The flags files are the declarations of the flags: name, key, type, options, description, default value. The flag management system stays the source of truth of the values (rules, rollouts, targeting).
- A branch which adds a flag shows it in its diff.
- The build and the type check use no network and no credentials. They work offline, in CI and in a sandbox.
- A flag works before it exists in the system: the provider returns `FLAG_NOT_FOUND`, and the flag returns its `defaultValue`.
- To add a flag: add a `flag` block to a flags file. To use a flag which exists in the system: declare it in a flags file with its key. Nothing downloads the flags of the system.

## The format

- `source <name>` (optional, default `self`): the source of the flags of the file.
- `flag <name>` declares a flag. The name is a JavaScript name, and it is the export. The body `{ … }` is optional.
- The body is a JSON5 object: keys without quotes, strings in single or double quotes, trailing commas. A new line separates two fields; a comma is needed only between two fields on one line.
- Comments: `//` and `/* … */`.
- Only plain values: strings, numbers, `true`, `false`, `null`, arrays and objects. No references, calls, operators, template literals, `undefined`, `Infinity` or `NaN`.

| Field          | Value                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `key`          | The key in the flag management system. Default: the name.                                              |
| `source`       | The source of this flag, if it is not the source of the file.                                          |
| `description`  | What the flag does. Editors show it on hover.                                                          |
| `type`         | `"boolean"`, `"string"`, `"number"` or `"object"`. Optional.                                           |
| `defaultValue` | The value when the evaluation fails, e.g. before the flag exists in the system. Without it, a failed evaluation throws. |
| `options`      | The known values, as values or as `{ value: …, label: "…" }`. They do not limit the value.             |

- The type is `type`, else the type of `defaultValue`, else the type of the options, else `boolean`. So `flag newFeature` alone is a boolean flag.
- An object flag takes any JSON value (object, array, `null`). Each of its options must be `{ value: … }`.
- The name and the key are separate. A key can have any characters, e.g. `flag summerSale { key: "summer-sale" }`. A name which is not a JavaScript name, e.g. `flag summer-sale`, is an error with this fix.
- A key can be in one file once for each source.
- The build fails with the position of each error and a hint, e.g. `app.flags:5:3 - error: Unknown field "defualtValue" in the flag "summerSale". Did you mean "defaultValue"?`. A `defaultValue` which is not one of the options is a warning.

```js
flag banner {
  defaultValue: { text: "Welcome", color: "blue" }
  options: [
    { value: { text: "Welcome", color: "blue" }, label: "Default" }
    { value: { text: "Sale!", color: "red" }, label: "Sale" }
  ]
}

flag heroText {
  key: "hero-text"
  source: "marketing"   // a flag of another source, in a file of the source self
}
```

## Imports by source

`flags:<source>` has the flags of that source from all flags files. The code generation writes `.flags/<source>.ts`, which re-exports the flags with their names:

```ts
// .flags/self.ts (generated)
export { summerSale } from '../app.flags';
export { checkout } from '../app/checkout/checkout.flags';
```

- An app can have many flags files, also with the same source, e.g. one next to each feature.
- A flags file without flags is valid and defines its source: an empty `app.flags` gives `flags:self` with no exports.
- Without a flags file of a source, there is no `flags:<source>`: the bundler can not resolve the import, and the type check fails. Fix: create a flags file of that source (e.g. an empty `app.flags` for `flags:self`).
- A key or a name in two files of one source is a conflict. `flags sync` and a build fail: `flags: The key "checkout" of the source "self" is declared in app.flags and in checkout/checkout.flags. Declare it in one file.` The dev server reports it and goes on.

## The folder of a source

```text
app.flags           # source self (the default)
app/
  marketing.flags   # source marketing
flags/              # in the app root or in src/ (SvelteKit: src/flags)
  sources/
    self/
      provider.ts   # The OpenFeature provider
      context.ts    # Optional: getEvaluationContext(request, input)
      hooks.ts      # Optional: the OpenFeature hooks of the source
    marketing/
      provider.ts
  generated.d.ts    # Generated: the types of flags:self and flags:marketing
.flags/             # Generated, ignored by its own .gitignore
  self.ts
  marketing.ts
  aliases.json      # for the plugins
```

| File                    | Default export                                                        |
| ----------------------- | --------------------------------------------------------------------- |
| `provider.ts`           | The OpenFeature provider                                              |
| `context.ts` (optional) | `getEvaluationContext(request, input)`                                |
| `hooks.ts` (optional)   | `Hook[]`: the hooks of the source, given to `defineSource({ hooks })` |

- The files can also be `.mts`, `.tsx`, `.js` or `.mjs`.
- The folder name is the source name. It must start with a letter and contain only letters, digits, `-` and `_`.
- Each source needs `provider.ts`, except the [default source `self`](#the-default-source-self). Without it, the build fails: `The source "shop" needs flags/sources/shop/provider.ts.`
- The loaders watch the source folders, so a new `context.ts` needs no restart. A new source needs a restart of the dev server (its alias is new).

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
- Without `context.ts`, the provider gets only the context of the call side, and the flags take no input.

## The default source `self`

An app with `@vercel/flags-core` in any dependency field of `package.json` (`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`) needs no `flags/sources/self/provider.ts`. The provider of `self` is `new VercelProvider()` (OIDC token after `vercel link` + `vercel env pull`, or the SDK key in `FLAGS`), and its project is `{ system: 'vercel-flags' }`, so Flags Explorer links each flag to the dashboard.

- Each flag still needs a declaration in a flags file. The SDK does not read the flags of the Vercel project.
- Each file in `flags/sources/self/` replaces or adds only its part: `context.ts` adds the evaluation context and keeps the default provider; `provider.ts` replaces the provider, e.g. `new VercelProvider(createClient({ ... }))`; `hooks.ts` adds hooks.
- Every other source, and `self` without `@vercel/flags-core`, needs `provider.ts`.
- Opt out with `"selfSource": false` in `flags/config.json` (in the app root or in `src/`). Then `self` needs `provider.ts` too. The plugins, `flags sync` and `flags watch` read this file. There is no plugin option and no CLI flag.

## Code generation

The code generation writes `.flags/<source>.ts`, `.flags/aliases.json`, `flags/generated.d.ts` and the declaration file of each flags file (`app.d.flags.ts` for `app.flags`). It reads only the flags files.

| Setup                               | What compiles the flags files and runs the code generation                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Next.js `withFlags`                 | A Turbopack rule for `*.flags`. `next build` writes once, `next dev` writes after each change.     |
| SvelteKit / TanStack Start `flags()` | The Vite plugin. `vite build` writes once, `vite dev` writes after each change.                   |
| Nuxt module                         | `nuxt build` writes once, `nuxt dev` writes after each change. Also adds `flags/generated.d.ts` to the types of Nuxt. |
| Other Vite setups                   | `flags()` of `@flags-sdk/vite`.                                                                    |
| No bundler (Hono, Express, Node.js) | `node --import flags/register server.ts` (Node.js 22.15 or newer) compiles the files. Import the flags from the files, e.g. `./app.flags`. `flags sync` / `flags watch` write the types. |

- The dev server writes the modules before it resolves the imports.
- Without flags files, the code generation writes nothing.
- Opt out: `withFlags({}, { disableCodeGeneration: true })`, `flags({ disableCodeGeneration: true })`, `modules: [['@flags-sdk/nuxt', { disableCodeGeneration: true }]]`. The loaders still compile the flags files. `withFlags` still reads `.flags/aliases.json`, e.g. after `flags sync`.

## TypeScript

- **Declaration files** (each TypeScript version): `app.d.flags.ts` next to `app.flags`. Set `"allowArbitraryExtensions": true` in `tsconfig.json`, and add `*.d.flags.ts` to `.gitignore`. The loaders, `flags/register`, `flags sync`, `flags watch` and the dev servers write them. The SDK removes a declaration file with its own header when its flags file is gone.
- **`flags/generated.d.ts`**: one `declare module 'flags:<source>'` per source. TypeScript finds it with its default `include`. No `paths`. It goes into the `flags` folder which exists (app root or `src`); without one, into `src/flags/` if the app has `src/`, else into `flags/` (the folder is created).
- **The content mapper** (TypeScript 7.1 or newer, optional): `"contentMappers": [{ "package": "flags", "extensions": [".flags"] }]` in `tsconfig.json`, and `tsc --runExternalCode`. The editor then goes from an import to the flag in the flags file. The SDK still writes the declaration files for older editors.

In CI, write the types before the type check (or commit `flags/generated.d.ts`):

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
flags sync [dir]
flags watch [dir] [-- command ...args]
flags format [paths...] [--check]
flags format --stdin [--stdin-filepath <file>]
flags manifest [dir] [--out <file>]
```

- `flags sync`: writes the modules and the types once. Fails on a conflict of a key or a name.
- `flags watch`: writes, then again after each change of a flags file. With `-- command`, it starts the command after the first write, e.g. `flags watch -- node --import flags/register --watch server.ts`, and stops when the command ends. A new source needs a restart.
- `flags format`: formats flags files in place (default: the flags files of the current directory). `--check` writes nothing and fails if a file changes. `--stdin` formats the standard input to the standard output, for editors (e.g. as the external formatter of the language `Flags` in Zed).
- `flags manifest`: for apps without a framework plugin. Imports the flags modules of `dir` with Node.js, loads `flags/hooks.ts` and `flags/config.json` if found, and writes `flags-manifest.json` (or `--out`). Run it on the `tsc` output or on TypeScript sources with Node.js 22.18 or newer, e.g. `"postbuild": "flags manifest dist"`.

## Default values

A flag without a `defaultValue` throws a `FlagEvaluationError` when the evaluation fails, e.g. before the flag exists in the system. Give each flag a `defaultValue` where a safe value exists:

```js
flag checkout {
  options: ["control", "express"]
  defaultValue: "control"
}
```

Else catch the error where a fallback makes sense, and rethrow errors that are not a `FlagEvaluationError`, so framework signals pass:

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

## Flags files and the runtime

The flags files only shape the code. At runtime, the provider decides every value:

- A flag declared before it exists in the system returns its `defaultValue`.
- A variant added in the system after the deployment works at once: options do not limit the value.
- A flag removed from a flags file disappears from `flags:<source>` at the next generation, so TypeScript shows each call site that still uses it.

## Tests

In Vitest, add `flags()` of `@flags-sdk/vite`. Under Vitest, it writes the modules of `flags:<source>` one time and does not watch, so `vitest run` exits. See [testing.md](testing.md#with-flags-files).
