# For framework authors

How a framework connects to the Flags SDK. The packages `@flags-sdk/<framework>`
do this today. A framework can take over its package, vendor it, or provide
the same itself: everything here uses only the public API of `flags`.

The normative contract is [STANDARD.md](./STANDARD.md). The working notes
are in [SPEC.md](./SPEC.md), sections "Packages" and "Framework binding
contract".

## What a framework provides

1. **A framework binding:** the module behind the alias `flags/framework`.
   It gives the runtime the current request, the configuration, and the
   errors which the framework must receive.
2. **A build plugin:** it sets the aliases, registers `'use flags'` modules,
   and writes the manifest of the flags. It is optional without a bundler.
3. **Optional: code generation.** The build plugin generates the modules of
   `flags:<source>` from the catalogs of `flags/sources`, and sets the
   aliases `flags:<source>` (see "Code generation").

The code of the application imports only `flags`.

## The framework binding

```ts
// The module behind flags/framework
import type { SetupFramework } from 'flags';

export const setupFramework: SetupFramework = (runtime) => {
  runtime.setGetRequest(getRequest);
  runtime.setRethrow(rethrowSignal);
  runtime.setLoadConfig(async () => {
    // Import the files in the binding, which the bundler builds, so that
    // the aliases of the plugin apply
    const { configFromModules } = await import('flags/config');
    return configFromModules(
      await Promise.all([
        import('flags/hooks'),
        import('flags/overrides'),
        import('flags/settings'),
      ]),
    );
  });
};
```

The runtime calls `setupFramework` one time, before the first evaluation.

- **The request source** returns the current request as a
  `FlagsRequestInit` (`headers`, `cookies` and `url`, each optional), or
  `undefined` outside of a request. The SDK identifies a request by its
  `headers` object, so the source must give the same object during one
  request. A framework with a middleware which wraps the handler can call
  `runtime.onInvoke(request, next)` instead.
- **The rethrow** throws an error again if the framework must receive it,
  e.g. a redirect. The runtime calls it before it uses the default value of
  a flag. Use the check functions of the framework, e.g. `isRedirect()`.
- **Rendering and caches.** If the framework prerenders, the request
  source makes an evaluation part of the render at request time, e.g. with
  `connection()` of Next.js. In a cache scope of the framework, e.g.
  `'use cache'`, the request source throws, and the rethrow throws this
  error again (see [STANDARD.md](./STANDARD.md), section 5.4).
- **The config source** imports `flags/hooks`, `flags/overrides` and
  `flags/settings` itself, and gives them to `configFromModules` of
  `flags/config`, which returns the `Config` object
  `{ hooks?, overrides?, settings? }`. The binding is bundled, so the
  aliases apply to its imports, also when the framework loads `flags` from
  `node_modules`. `configFromModules` returns the same object while the
  files do not change. In development, the runtime calls
  it before each evaluation, so a change applies without a restart.
- **No static import of `flags`.** `flags` imports the binding, so the
  binding imports only types from `flags`. It gets the runtime as an
  argument.

## The replaceable modules

The runtime imports these modules through its own package name. A bundler
alias replaces them. The alias only reaches the SDK when the bundler
bundles `flags`, so bundle it into the server code (e.g. `ssr.noExternal` of
Vite, `externals.inline` of Nitro).

| Module            | Default          | Replaced by                             |
| ----------------- | ---------------- | --------------------------------------- |
| `flags/framework` | no binding       | the framework binding                   |
| `flags/hooks`     | no hooks         | `flags/hooks.ts` of the application     |
| `flags/overrides` | no options       | `flags/overrides.ts` of the application |
| `flags/settings`  | the defaults     | `flags/config.json` of the application  |

`flags/config` is not replaced. It is the loader of the SDK, and imports the
other three modules. Find the files with `findConfigModules(dir)` of
`flags/tooling`. It returns the path of each file which exists, by its
module, e.g. `{ 'flags/hooks': '/app/flags/hooks.ts' }`. Set an alias only
for a file which exists. Without the file, `flags` ships an empty default
module.

- **Resolve from the project.** With pnpm, a replacement which is a package
  name must be resolved from the project, not from `flags`. E.g. a
  `resolveId` hook with the order `pre` in Vite: the resolver of Vite would
  otherwise resolve the module through the exports of the package `flags`.
- **One copy of the framework.** If the binding uses `instanceof` or check
  functions of the framework, the binding and the application must use one
  copy of it, e.g. with `resolve.dedupe` of Vite.
- **Without an alias:** if a runtime loads `flags` from `node_modules`, e.g.
  Nitro in development, register the binding directly at startup:

  ```ts
  import { registerFramework } from 'flags/tooling';
  import { setupFramework } from './binding';

  registerFramework(setupFramework);
  ```

  The first binding wins, as with the alias.
- **Several copies of the SDK** in one process, e.g. one for each layer of
  Next.js, share one runtime through `globalThis`. A copy without the alias,
  e.g. in the process of the build tool, does not hide the binding of a
  copy in the server code.

## The lifecycle

The runtime methods map to the phases of a serverless function:

- `runtime.onInit()`: at startup. It initializes the providers.
- `runtime.onInvoke(request, next)`: for each request, if the framework has
  a middleware which wraps the handler.
- `runtime.onShutdown()`: when the process stops. It closes the providers.

All three are optional. Without `onInit`, a provider is initialized at its
first evaluation.

## `'use flags'` modules and the manifest

A module which starts with the `'use flags'` directive exports only flags,
and importing it has no side effects. The build plugin does two things with
it, with the functions of `flags/tooling`:

1. **Registration.** `hasUseFlagsDirective(source)` finds the directive,
   and `addSelfRegistration(source, fileName)` appends a call of
   `registerFlags` with the exports of the module.
2. **The manifest.** `findFlagsModules(projectDir)` finds the modules. Import
   them with the bundler of the framework, and give their exports to
   `createManifest` of `flags/manifest`:
   - in development, at `/.well-known/flags/manifest.json`, with
     `cache-control: no-store`, and only in development;
   - after a build, as `MANIFEST_FILE` (`flags-manifest.json`) in the
     server output. `writeManifestFromBuild` imports the built modules in a
     child process, so they do not run in the process of the build.

Call `runtime.prepare()` before `createManifest`. It sets up the binding
and loads the configuration, without the initialization of providers.

## Code generation

Code generation is optional. Each source is a directory
`flags/sources/<source>` with `catalog.ts`, `provider.ts`, an optional
`context.ts` and an optional `hooks.ts`. By convention, the main source of an application is `flags/sources/self`.
The folder `flags` is in the root of the application or in `src`. The build
plugin generates `.flags/<source>.ts`, and the types in
`flags/generated.d.ts`, with the functions of `flags/tooling`, and sets the
alias `flags:<source>` to each module:

- for a build, `generateFlags(dir)` one time, before the bundler resolves
  the imports;
- for a dev server, `watchFlags(dir, { signal })`, which generates again
  after each change of a catalog.

An application which depends on `@vercel/flags-core` has the default source
`self`, with the flags of its Vercel project, also without
`flags/sources/self`. The application turns it off with `"selfSource": false`
in `flags/config.json`. The code generation reads this file itself, so the
plugin needs no option for it. To read the settings in the plugin, use
`readSettings(dir)` of `flags/tooling`. Find the types with `findGeneratedDeclarations(dir)`, not next
to `flags/sources`: for the default source, they can be in
`src/flags/generated.d.ts` without a folder `flags/sources`.

Both return the aliases, e.g. `{ "flags:self": "./.flags/self.ts" }`. The
plugins of this repository generate the code by default, and have the
option `disableCodeGeneration` to turn it off, e.g.
`flags({ disableCodeGeneration: true })`. Without `flags/sources` and without the default source,
they write nothing. A framework without a bundler has no
plugin: the application runs `flags sync` and imports `./.flags/self.ts`.

## `flags/tooling`

| Function                 | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `registerFramework`      | Registers a binding without the alias                         |
| `findConfigModules`      | Finds `flags/hooks.ts`, `flags/overrides.ts` and `flags/config.json` in a directory or its `src` |
| `readSettings`           | Reads and checks `flags/config.json`, or returns the defaults |
| `hasUseFlagsDirective`   | Finds the `'use flags'` directive in the directive prologue   |
| `addSelfRegistration`    | Appends the registration to a `'use flags'` module            |
| `findFlagsModules`       | Finds the `'use flags'` modules of a project                  |
| `writeManifestFromBuild` | Writes the manifest from the built modules                    |
| `MANIFEST_FILE`          | `flags-manifest.json`                                         |
| `optionIndex`            | The index of a value in the options of a flag                 |
| `generateFlags`          | Generates the modules of `flags:<source>` one time            |
| `watchFlags`             | Generates them again after each change of a catalog           |
| `findGeneratedDeclarations` | Finds `flags/generated.d.ts` in a directory or its `src`   |
| `renderSourceModule`     | Renders the module of one source from its catalog             |
| `GENERATED_DIRECTORY`    | `.flags`                                                      |

## For deployment platforms

- Each flag of a provider names its source, and the configuration has no
  source. The default is on the level of the files: with
  `@vercel/flags-core`, the code generation gives the default source `self`
  of Vercel Flags.
- Put `flags-manifest.json` of the build into your build output, so that
  tools can read it. For Next.js, use `onBuildComplete` of the Adapter API.

## A new flag management system

A system adds itself with a pull request to `flags`:

- its fields in `ProjectFieldsBySystem` (`src/source.ts`), e.g.
  `{ projectId: string }`;
- the URL of its system manifest in `systemManifestUrls`. The system
  manifest has the templates of the links to its dashboard (see
  [SPEC.md](./SPEC.md), section "Links to the dashboard"). Until the system
  publishes its own file, the SDK hosts it.

## Testing a binding

Run the conformance suite
[`@flags-sdk/conformance`](../conformance/README.md) in an app of your
framework. It checks the request, one context for each request, separate
requests, a signal, an override cookie and the manifest.

`tests/standard/<framework>` has a small app for each framework, with the
suite and more end-to-end tests over HTTP. Each app tests:

- the evaluation with the request, and one evaluation context for each
  request;
- `flags/hooks.ts` without code in the application;
- an override cookie;
- a signal of the framework from `getEvaluationContext`, e.g. a redirect;
- the registration of a `'use flags'` module, and the manifest in
  development and in the build.

The bindings in `packages/framework-*` are the reference implementations.
