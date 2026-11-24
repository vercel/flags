# @flags-sdk/vite

The Vite plugin of the [Flags SDK](../flags), for the framework packages:
[`@flags-sdk/sveltekit`](../framework-sveltekit),
[`@flags-sdk/nuxt`](../framework-nuxt) and
[`@flags-sdk/tanstack-start`](../framework-tanstack-start). An application
uses the plugin of its framework package, not this one.

## Features

- **The framework binding** behind `flags/framework`, and the configuration
  files behind `flags/hooks` (`flags/hooks.ts`) and `flags/settings`
  (`flags/config.json`).
- **`'use flags'` modules** register their flags.
- **The manifest of the flags:** at `/.well-known/flags/manifest.json` in
  development, and as `flags-manifest.json` in the server output.
- **Flags files** (`*.flags`): the plugin compiles them. By default, it
  also runs the code generation of `flags:<source>` from the flags files,
  with the types in `flags/generated.d.ts`. The option
  `disableCodeGeneration` turns it off. In an application which depends on
  `@vercel/flags-core`, the source `self` uses `new VercelProvider()`
  without `flags/sources/self/provider.ts`. `"selfSource": false` in
  `flags/config.json` turns it off.
- **A Rollup plugin too**, e.g. for the server build of Nitro.

## Installation

```sh
pnpm add @flags-sdk/vite
```

## Usage

```ts
import { flags } from '@flags-sdk/vite';

export function myFrameworkFlags() {
  return flags({
    binding: '@flags-sdk/my-framework/binding',
    bundle: ['@flags-sdk/my-framework'],
    dedupe: ['my-framework'],
  });
}
```

| Option            | Meaning                                                                         |
| ----------------- | ------------------------------------------------------------------------------- |
| `binding`         | The module behind `flags/framework`, resolved from the project                  |
| `bundle`          | More packages to bundle into the server code, e.g. the package of the binding   |
| `dedupe`          | Packages which the binding imports, which must be the copy of the project       |
| `projectModules`  | Modules which the binding imports, by the first package which the project has   |
| `disableCodeGeneration` | Turns off the code generation. By default, the plugin writes `.flags/<source>.ts` and `flags/generated.d.ts` from the flags files: one time for a build, and again after each change of a flags file for the dev server. It adds the aliases `flags:<source>` |
| `manifest`        | Whether a build writes `flags-manifest.json`. The default is `true`             |
| `root`            | The directory of the project. The default is the root of Vite                   |

See [For framework authors](../flags/FRAMEWORK-AUTHORS.md).

## License

MIT
