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
3. **Optional, for a deployment platform:** the alias of
   `flags/default-provider`, e.g. to a fast provider of the platform.

The code of the application imports only `flags`.

## The framework binding

```ts
// The module behind flags/framework
import type { SetupFramework } from 'flags';

export const setupFramework: SetupFramework = (runtime) => {
  runtime.setRequestSource(getRequest);
  runtime.setRethrow(rethrowSignal);
  runtime.setConfigSource(async () => (await import('flags/config')).config);
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
- **The config source** loads `flags.config.ts` through the alias
  `flags/config`. In development, the runtime calls it before each
  evaluation, so a change applies without a restart.
- **No static import of `flags`.** `flags` imports the binding, so the
  binding imports only types from `flags`. It gets the runtime as an
  argument.

## The replaceable modules

The runtime imports three modules through its own package name. A bundler
alias replaces them. The alias only reaches the SDK when the bundler
bundles `flags`, so bundle it into the server code (e.g. `ssr.noExternal` of
Vite, `externals.inline` of Nitro).

| Module                   | Default          | Replaced by                                 |
| ------------------------ | ---------------- | ------------------------------------------- |
| `flags/framework`        | no binding       | the framework binding                       |
| `flags/config`           | no configuration | `flags.config.ts` of the application        |
| `flags/default-provider` | OFREP            | the provider of a platform, for its builds  |

- **Resolve from the project.** With pnpm, a replacement which is a package
  name must be resolved from the project, not from `flags`. E.g. a
  `resolveId` hook with the order `pre` in Vite: the resolver of Vite would
  otherwise resolve `flags/default-provider` through the exports of the
  package.
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

Call `runtime.prepare()` before `createManifest`, so that flags without a
connection get the default connection of `flags.config.ts`.

## `flags/tooling`

| Function                 | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `registerFramework`      | Registers a binding without the alias                         |
| `findConfigFile`         | Finds `flags.config.ts` in a directory or its `src`           |
| `hasUseFlagsDirective`   | Finds the `'use flags'` directive in the directive prologue   |
| `addSelfRegistration`    | Appends the registration to a `'use flags'` module            |
| `findFlagsModules`       | Finds the `'use flags'` modules of a project                  |
| `writeManifestFromBuild` | Writes the manifest from the built modules                    |
| `MANIFEST_FILE`          | `flags-manifest.json`                                         |
| `optionIndex`            | The index of a value in the options of a flag                 |

## For deployment platforms

- Set the alias of `flags/default-provider` for your builds, not for
  development. The module exports `createDefaultProvider()`, which returns
  an OpenFeature provider. The runtime calls it one time for each process.
- A `defaultConnection` in `flags.config.ts` always wins over your
  provider.
- Put `flags-manifest.json` of the build into your build output, so that
  tools can read it.
- For Next.js, use the Adapter API (`modifyConfig` for the alias,
  `onBuildComplete` for the manifest). Vite frameworks have no such step
  after the build, so their plugin sets the alias, e.g. on Vercel when
  `VERCEL` is set.

## A new flag management system

A system adds itself with a pull request to `flags`:

- its fields in `ProjectFieldsBySystem` (`src/connection.ts`), e.g.
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
- `flags.config.ts` without code in the application;
- an override cookie;
- a signal of the framework from `getEvaluationContext`, e.g. a redirect;
- the registration of a `'use flags'` module, and the manifest in
  development and in the build;
- for platforms: a variant with the default provider of the platform.

The bindings in `packages/framework-*` are the reference implementations.
