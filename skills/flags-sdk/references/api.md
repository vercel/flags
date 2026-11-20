# API reference (v5)

App code imports only `flags` and the generated `flags:<source>` modules. The framework packages are for the setup, and in Next.js also for precompute, `FlagValues` and the manifest route.

## Table of contents

- [`flags`](#flags)
  - [Defining flags](#defining-flags)
  - [Sources](#sources)
  - [Evaluating flags](#evaluating-flags)
  - [Runtime](#runtime)
  - [Configuration](#configuration)
  - [Registration](#registration)
  - [Overrides](#overrides)
  - [Flag values](#flag-values)
  - [Tracking](#tracking)
  - [Errors and reasons](#errors-and-reasons)
  - [Code generation types](#code-generation-types)
  - [Types](#types)
- [`flags/tooling` and `flags/manifest`](#flagstooling-and-flagsmanifest)
- [The `flags` CLI](#the-flags-cli)
- [`@flags-sdk/next`](#flags-sdknext)
- [Other framework packages](#other-framework-packages)

## `flags`

Node.js 20.19, or 22.12 or newer. Server only.

| Entry point      | For                                                             |
| ---------------- | --------------------------------------------------------------- |
| `flags`          | Applications                                                    |
| `flags/tooling`  | Framework packages and build tools                              |
| `flags/manifest` | Tools that create or read the flags manifest                    |

`flags/framework`, `flags/hooks`, `flags/overrides` and `flags/settings` are replaced by bundler aliases of the framework packages. `flags/config` exports `configFromModules` for the bindings. Apps do not import them.

### Defining flags

#### `defineFlag`

An inline flag: `decide` sets the value. The evaluation reason is `DECIDE`.

```ts
function defineFlag(options: InlineFlagOptions): Flag;
```

| Option         | Type                                                                    | Description                                                                 |
| -------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `key`          | `string`                                                                | Required.                                                                   |
| `decide`       | `(request: FlagsRequest \| undefined, context: In) => V \| Promise<V>`  | Required. The type of `context` defines what the call side must pass.       |
| `type`         | `'boolean' \| 'string' \| 'number' \| 'object'`                         | Default `'boolean'`.                                                        |
| `options`      | `readonly (V \| { value: V; label?: string })[]`                        | Known values. For `object` flags, only `{ value }` objects.                 |
| `defaultValue` | `V`                                                                     | Returned when `decide` fails. Without it, the error is thrown.              |
| `description`  | `string`                                                                | Shown in Flags Explorer.                                                    |

Throws a `TypeError` without `decide`, or with a `source`.

#### `source.bindFlag`

A provider flag: the provider of the source sets the value. `bindFlag` is a method of the source that `defineSource` returns (`BindableSource`). Code generation writes these calls.

```ts
source.bindFlag(key: string, options?: BindFlagOptions): Flag;
```

`key` is required: the key in the flag management system. All options are optional:

| Option                 | Type                                                                                  | Description                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `type`                 | `'boolean' \| 'string' \| 'number' \| 'object'`                                       | Default `'boolean'`. Selects `resolveBooleanEvaluation`, `resolveStringEvaluation`, `resolveNumberEvaluation` or `resolveObjectEvaluation`. |
| `options`              | `readonly (V \| { value: V; label?: string })[]`                                      | Known values. They do not limit the value.                                                        |
| `defaultValue`         | `V`                                                                                   | Returned when the evaluation fails. Without it, a `FlagEvaluationError` is thrown.                |
| `description`          | `string`                                                                              | Shown in Flags Explorer.                                                                          |
| `getEvaluationContext` | `(request: FlagsRequest \| undefined, context: In) => SourceInput<C> \| Promise<...>` | The middle step of the context chain: converts the call side context into the input of the source. |

Throws a `TypeError` with `decide`, or when `options` is not an object.

```ts
'use flags';

import { self } from './flags/self';

export const summerSale = self.bindFlag('summerSale', {
  defaultValue: false,
});

export const checkout = self.bindFlag('checkout', {
  type: 'string',
  options: ['control', 'express'],
  defaultValue: 'control',
  description: 'The checkout flow',
});

await checkout(); // 'control' | 'express' | (string & {})
```

#### `Flag`

A flag is an async function with read-only fields: `key`, `type`, `defaultValue?`, `options?` (always `{ value, label? }` objects), `description?`, `source` (an inline flag has an internal `DecideSource`), and `getEvaluationContext?`.

```ts
summerSale.key; // 'summerSale'
checkout.options; // [{ value: 'control' }, { value: 'express' }]
enableSale.source; // the source, e.g. for track()
```

`FlagValueOfFlag<typeof checkout>` gives the value type.

### Sources

#### `defineSource`

```ts
function defineSource(options: {
  provider: Provider;
  project?: Project;
  getEvaluationContext?: (request: FlagsRequest | undefined, context: In) => C | Promise<C>;
  hooks?: readonly Hook[];
}): BindableSource;
```

- `provider`: any OpenFeature server provider, as it is. Several sources can share one instance; the SDK initializes it once.
- `project`: the flag project, for the dashboard links of Flags Explorer. It does not change the evaluation.
- `getEvaluationContext`: the last step of the chain. Runs once per request and input. Outside a request, it runs on each evaluation with `request` undefined. The type of its second parameter is what the flags of the source must pass.
- `hooks`: OpenFeature hooks for the flags of this source. They also run for overrides.

The returned source is frozen. It is a `BindableSource`: a `Source` with the method [`bindFlag`](#sourcebindflag) for its flags. Throws for a `project` with `platform` (use `system`), or a `systemManifest` that is not an HTTPS URL.

#### `Project`

| `system`         | Fields                                                         | Notes                                                                    |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `'vercel-flags'` | `projectId?`, `teamId?`                                        | Without fields: the Vercel project of the deployment.                    |
| `'launchdarkly'` | `projectId` (project key), `teamId?`, `environment?`           | Links to a flag need `environment`.                                      |
| `'in-memory'`    | none                                                           | For providers without a dashboard.                                       |

Each project also accepts `systemManifest?: string` (HTTPS). Other systems: leave out `project`.

Types: `Source`, `SourceOptions`, `SourceInput<S>`, `DefaultSourceInput` (`EvaluationContext | undefined`), `GetEvaluationContext<In, Out>`, `FlagManagementSystem`, `ProjectFieldsBySystem`.

### Evaluating flags

#### Calling a flag

```ts
flag(options?: { evaluationContext?: In; hooks?: readonly Hook[]; hookHints?: HookHints }): Promise<V>;
```

- Options are optional when the flag accepts `undefined` as its context. If the flag or source needs a context, TypeScript requires `evaluationContext`.
- One evaluation per request and input. A call with `hooks` or `hookHints` gets its own evaluation.

#### `evaluate`

```ts
function evaluate(flag, options?): Promise<Value>;
function evaluate(flags: readonly Flag[], options?): Promise<[...Values]>;
function evaluate({ key, source, type?, defaultValue? }, options?): Promise<Value>; // a plain definition
```

- For a list, each flag gets the same `evaluationContext`. Its type is the intersection of the contexts.
- A flag without `defaultValue` that fails makes the whole call reject.
- `evaluate(flag)` and `flag()` share the per-request cache.
- Prefer the direct call, `await flag()`. `evaluate` is not faster: each flag is evaluated once per request, and calls in parallel share the work. It is a convenience for lists.

Types: `Evaluate`, `FlagEvaluationContext<F>`, `EvaluateContext<F[]>`, `EvaluateResults<F[]>`, `FlagValueOfFlag<F>`, `EvaluationOptions`, `EvaluationArgs`.

### Runtime

`import { runtime } from 'flags'`. One runtime per process, shared by all copies of the package.

| Method                                      | Description                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `runtime.configure(config)`                 | Sets the configuration: `{ hooks?, overrides?, settings? }` (the files `flags/hooks.ts`, `flags/overrides.ts` and `flags/config.json`). Throws before it changes anything if the config is invalid, e.g. with a `defaultSource`. |
| `runtime.onInit()`                          | Optional, at startup. Sets up the binding, loads the config, initializes the providers of all registered sources. Logs errors. |
| `runtime.onInvoke(request, next)`           | Runs `next` in the scope of the request. `request` is a Web `Request` or `{ headers?, cookies?, url? }`. Pass the same `headers` object for the whole request. |
| `runtime.onShutdown()`                      | At process stop. Waits for running initializations, then calls `onClose` of each provider.                                       |
| `runtime.prepare()`                         | Sets up the binding and loads the config without initializing providers. For tools.                                              |
| `runtime.addHandler(event, handler)`        | Provider events: `'PROVIDER_READY'`, `'PROVIDER_ERROR'`, `'PROVIDER_CONFIGURATION_CHANGED'`, `'PROVIDER_STALE'`. Filter by `details.providerName`. |
| `runtime.removeHandler(event, handler)`     | Removes a handler.                                                                                                                |
| `runtime.waitForInitialization()`           | Waits for running initializations. Does not throw.                                                                                |
| `runtime.evaluate`                          | The same as `evaluate`.                                                                                                           |
| `runtime.setGetRequest(fn)`, `runtime.setRethrow(fn)`, `runtime.setLoadConfig(fn)` | For framework bindings only.                                                   |

Types: `Runtime`, `GetRequest`, `LoadConfig`, `SetupFramework`, `FlagDefinition`.

### Configuration

One optional file for each part, in `flags/` (in the app root or in `src/`). There is no `flags/config.ts` and no `defineConfig`.

| File | Contains | Read by |
| --- | --- | --- |
| `flags/config.json` | Static settings (`Settings`): `selfSource` (boolean, default `true`). `$schema` is allowed. An unknown key or a wrong type is an error. | The plugins, the CLI and the runtime |
| `flags/hooks.ts` (`.mts`, `.js`, `.mjs`) | Default export: `Hook[]`, the hooks for all flags | The app |
| `flags/overrides.ts` (`.mts`, `.js`, `.mjs`) | Default export: `OverridesOptions` (see below). Code is allowed, e.g. `secret: process.env.MY_SECRET` | The app |
| `flags/sources/<source>/hooks.ts` | Default export: the hooks of one source, for `defineSource({ hooks })` | The app |

```ts
// flags/hooks.ts
import type { Hook } from 'flags';

const hooks: Hook[] = [
  {
    after(hookContext, details) {
      console.log(`${hookContext.flagKey}: ${details.value} (${details.reason})`);
    },
  },
];

export default hooks;
```

```jsonc
// flags/config.json
{
  "$schema": "https://flags-sdk.dev/schemas/config.v1.json",
  "selfSource": false
}
```

- Hook order: `flags/hooks.ts` (all flags), then the source (`defineSource({ hooks })` or `flags/sources/<source>/hooks.ts`), then the call (`evaluate(..., { hooks })`), then `provider.hooks` (set by the provider, not by the app). The hooks also run for overrides.
- No sources in the configuration.
- The plugins of Next.js, SvelteKit, Nuxt and TanStack Start load the files, and reload them in development. Hono and Express: `app.use(flags({ config: { hooks, overrides } }))` with `import hooks from './flags/hooks'`. No framework: `runtime.configure({ hooks, overrides })`. Without a bundler, read `flags/config.json` yourself if the app needs it; `flags sync` and `flags watch` read it anyway.
- Types: `Config` (`{ hooks?, overrides?, settings? }`), `Settings` (`{ selfSource?: boolean }`).

### Registration

Flags register their sources when they are defined, and the plugins register `'use flags'` modules. Use these only for sources whose flags are defined later, or without a plugin.

- `registerFlags(moduleExports)`: registers the sources of all exported flags. Throws if an export is not a flag.
- `registerSources(sources)`: registers sources directly.

### Overrides

Cookie `flag-overrides` (also the v4 cookie `vercel-flag-overrides`; `flag-overrides` wins). Default trust, without configuration:

1. If `FLAGS_SECRET` is set, tokens encrypted with it.
2. On Vercel or with a linked project (`VERCEL` or `VERCEL_OIDC_TOKEN` set), tokens that Vercel signed for this project and environment. This also applies when `FLAGS_SECRET` is set.
3. Otherwise, no overrides.

A valid override skips the provider, the provider initialization and the context chain. The hooks run with the reason `OVERRIDE`. An override of the wrong type is ignored with a warning.

#### `encryptOverrides`

```ts
function encryptOverrides(
  overrides: FlagOverrides,
  secret?: string, // default: process.env.FLAGS_SECRET
  expirationTime?: string | number | Date, // default: '1y'
): Promise<string>;
```

Throws without a secret, or when the secret is not 32 bytes in base64url (or standard base64).

#### `signOverrides`

```ts
function signOverrides(overrides: FlagOverrides, options?: { ttl?: number }): Promise<string>;
```

Asks Vercel to sign a token for the project and environment of the host's OIDC token (the request token on a deployment, or `VERCEL_OIDC_TOKEN` after `vercel env pull`). `ttl` in seconds: default 1 hour, at most 1 day. Throws without an OIDC token or project. Vercel rate-limits signing.

#### `decryptOverrides`

```ts
function decryptOverrides(token: string, secret?: string): Promise<FlagOverrides | undefined>;
```

#### `OverridesOptions` (the default export of `flags/overrides.ts`)

| Option   | Type                                | Description                                                                  |
| -------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `secret` | `string \| false`                   | The shared secret. Default `FLAGS_SECRET`. `false` accepts no such tokens.    |
| `vercel` | `boolean \| VercelOverridesOptions` | Tokens signed by Vercel. `true`, `false`, or options.                          |

`VercelOverridesOptions`: `project` (`projectId`, `environment`, `teamId?`), `maxLifetimeSeconds` (default 7 days), `issuer`, `jwksUrl`, `cacheMaxAgeMs` (default 5 minutes), `cooldownMs` (default 30 seconds), `allowInsecureLocalhost`, `fetch`. Turn overrides off with `{ secret: false, vercel: false }` in `flags/overrides.ts`.

Types: `FlagOverrides` (`Record<string, JsonValue>`), `OverrideRejection`, `OverridesError`, `PlatformProject`.

Rejection reasons in the log line `flags: The override cookie was ignored. Reason: <reason>.`: `malformed-token`, `token-too-large`, `missing-secret`, `invalid-secret`, `invalid-jwe`, `untrusted-jws`, `unsupported-algorithm`, `invalid-signature`, `expired-token`, `invalid-claims`, `wrong-scope`, `unknown-key`.

- `wrong-scope`: the token is for another project or environment. Check the link, and run `vercel env pull` again.
- `missing-secret`: the cookie is encrypted, but the app has no `FLAGS_SECRET`.
- `untrusted-jws`: the cookie is signed by Vercel, but the app does not accept signed cookies here, e.g. the project is not linked. Link it, or set `overrides.vercel`.
- `expired-token`, `invalid-signature`, `unknown-key`: create the override again.

### Flag values

For Flags Explorer and analytics. In Next.js, use `FlagValues` instead.

```ts
function encryptFlagValues(values: Record<string, JsonValue>, options?: EncryptFlagValuesOptions): Promise<string>;
function decryptFlagValues(token: string, secret?: string): Promise<Record<string, JsonValue> | undefined>;
function serializeFlagValues(data: Record<string, JsonValue> | string): string;
```

- `encryptFlagValues` options: `method` (`'secret'` with `FLAGS_SECRET`, v4 format, the default if `FLAGS_SECRET` is set; `'platform'` with the Vercel public key otherwise), `secret`, `expirationTime`, `jwksUrl`, `project`, `projectIds`, `fetch`.
- `serializeFlagValues` escapes `<`, so the content cannot end the element.

```ts
import { encryptFlagValues, evaluate, serializeFlagValues } from 'flags';

const [sale, flow] = await evaluate([summerSale, checkout]);
const token = await encryptFlagValues({ summerSale: sale, checkout: flow });
const html = `<script type="application/json" data-flag-values>${serializeFlagValues(token)}</script>`;
```

### Tracking

```ts
function track(source: Source, eventName: string, options?: { evaluationContext?: In; details?: TrackingEventDetails }): Promise<void>;
```

The source is required. A generated module does not export its source: use `enableSale.source`. Waits for the provider. Errors are logged, not thrown.

### Errors and reasons

- `FlagEvaluationError` with `flagKey`, `code` (e.g. `FLAG_NOT_FOUND`, `TYPE_MISMATCH`, `PROVIDER_FATAL`, `GENERAL`), `message`, `cause`. Rethrow other errors in your `catch` blocks: framework signals such as `redirect()` must pass.
- `DECIDE_REASON` (`'DECIDE'`) and `OVERRIDE_REASON` (`'OVERRIDE'`) for hooks.
- Without `defaultValue`, the provider receives a placeholder default (`false`, `''`, `0`, `{}`).

### Code generation types

- `CatalogLoader`: `(options: CatalogLoadOptions) => Catalog | AsyncIterable<Catalog> | Promise<...>`.
- `CatalogLoadOptions`: `{ signal: AbortSignal }`.
- `Catalog`: `{ flags: Record<string, CatalogFlag>; project?: Project; revision?: number }`.
- `CatalogFlag`: `{ variants: readonly unknown[]; description?: string; defaultValue?: unknown }`.

### Types

- Values: `FlagType`, `FlagValue`, `FlagObjectValue`, `JsonValue`, `FlagValueOf<T>`, `FlagOption<V>`, `FlagOptionObject<V>`, `FlagOptionsOf<T>`, `FlagValueFrom<T, O>`.
- Request: `FlagsRequestInit` (`{ headers?, cookies?, url? }`; a Web `Request` fits), `FlagsRequest` (`{ headers, cookies, url }`, each possibly `undefined`; cookies come from the `Cookie` header if needed), `ReadonlyHeaders`, `ReadonlyRequestCookies` (`get`, `getAll`, `has`), `RequestCookie`.
- OpenFeature (structural, no dependency on `@openfeature/*`): `Provider` (only `metadata` and `resolveBooleanEvaluation` required), `ProviderMetadata`, `ResolutionDetails<T>`, `EvaluationContext`, `EvaluationContextValue`, `PrimitiveValue`, `Hook`, `HookContext`, `BeforeHookContext`, `HookData`, `HookHints`, `HookFlagValue`, `EvaluationDetails<T>`, `FlagMetadata`, `ClientMetadata`, `ProviderEvent`, `ProviderEventDetails`, `EventDetails`, `EventHandler`, `EventMetadata`, `ProviderEventEmitter`, `TrackingEventDetails`, `TrackingEventValue`, `Logger`.
- Other: `Config`, `FlagOptions`, `InlineFlagOptions`, `TrackArgs`, `TrackOptions`, `EncryptFlagValuesOptions`, `FlagValuesType`.

## `flags/tooling` and `flags/manifest`

For framework packages and build tools. Apps do not use them.

`flags/tooling`: `registerFramework(setup)`, `findConfigModules(dir)` (returns `{ 'flags/hooks'?, 'flags/overrides'?, 'flags/settings'? }`, the paths of `flags/hooks.ts`, `flags/overrides.ts` and `flags/config.json` in `dir` or `dir/src`), `readSettings(dir)` (reads and checks `flags/config.json`; `{}` without the file), `hasUseFlagsDirective(source)`, `addSelfRegistration(source, fileName)`, `findFlagsModules(projectDir)`, `writeManifestFromBuild({ projectDir, modules, output })`, `generateFlags(dir?)` (behind `flags sync`, returns aliases such as `{ 'flags:self': './.flags/self.ts' }`), `watchFlags(dir, { signal })` (behind `flags watch`), `findGeneratedDeclarations(dir)` (finds `flags/generated.d.ts` in `dir` or `dir/src`), `renderSourceModule(name, catalog, sourcesPath?, files?)`, `optionIndex(value, options)`, `MANIFEST_FILE` (`'flags-manifest.json'`), `GENERATED_DIRECTORY` (`'.flags'`). `generateFlags` and `watchFlags` read `"selfSource"` of `flags/config.json`. Types: `FlagsAliases`, `WatchResult`, `ConfigModule`, `SourceFiles` (`{ context?: boolean; provider?: 'file' | 'vercel'; hooks?: boolean }`; `hooks` imports `hooks.ts` of the source; `'vercel'` renders `new VercelProvider()` instead of the import of `provider.ts`).

`flags/manifest`: `createManifest(modules)` (from `{ id, exports }` of `'use flags'` modules; throws for an export that is not a flag), `validateFlagsManifest`, `validateSystemManifest`, `resolveFlagLinks`, `expandTemplate`.

```ts
import { createManifest } from 'flags/manifest';
import * as flags from '../flags';

const manifest = createManifest([{ id: 'flags.ts', exports: { ...flags } }]);
```

## The `flags` CLI

```sh
flags sync [dir] [--production]
flags watch [dir] [--production] [-- command ...args]
flags manifest [dir] [--out <file>]
```

See [code-generation.md](code-generation.md#the-cli).

## `@flags-sdk/next`

Next.js 15.4 or newer, App Router, Turbopack.

| Entry point                      | Exports                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `@flags-sdk/next/plugin`         | `withFlags`, `FlagsPluginOptions`, `NextConfigFunction`                                      |
| `@flags-sdk/next/precompute`     | `precompute`, `getPrecomputed`, `generatePermutations`, `serialize`, `deserialize`, `combine` |
| `@flags-sdk/next/flag-values`    | `FlagValues`, `FlagValuesProps`                                                              |
| `@flags-sdk/next/manifest`       | `GET`                                                                                        |
| `@flags-sdk/next/binding`        | `setupFramework` (set by `withFlags`)                                                        |
| `@flags-sdk/next/encrypt-values` | `encryptValues`, `EncryptValuesOptions` (used by `FlagValues`)                               |

### `withFlags`

```ts
function withFlags<T extends object>(
  config?: T | NextConfigFunction<T>,
  options?: { dir?: string; disableCodeGeneration?: false },
): NextConfigFunction<T>;
function withFlags<T extends object>(config: T, options: { dir?: string; disableCodeGeneration: true }): T;
```

- Adds the aliases `flags/framework` (the binding: `headers()`, `cookies()`, `connection()`, `unstable_rethrow`), `flags/hooks`, `flags/overrides` and `flags/settings` (to `flags/hooks.ts`, `flags/overrides.ts` and `flags/config.json`, if they exist), and `flags:<source>` (from `.flags/aliases.json`).
- Self-registers each `'use flags'` module, and writes `flags-manifest.json` into `distDir` after `next build`.
- Injects a random precompute secret per build, unless `FLAGS_PRECOMPUTE_SECRET` is set.
- With Cache Components, encrypts `FlagValues` in `'use cache'`.
- Generates code once for `next build`, watches for `next dev`, does nothing for `next start`.
- `dir`: where to look for the folder `flags` (also in `src`). Default: the current directory.
- No default source `self` for an app with `@vercel/flags-core`: `"selfSource": false` in `flags/config.json` (see [code-generation.md](code-generation.md#the-default-source-self)). Set it when the sources are written by hand. There is no option of `withFlags` for it.
- Returns a phase function, so it must be the outer plugin. With `disableCodeGeneration: true` and an object config, it returns the object.
- A phase function config: `withFlags((phase) => ({ ... }))`. Do not call `withFlags` inside the function.

### Precompute

```ts
function precompute(flags, options?: { request?: FlagsRequestInit; evaluationContext?: In; secret?: string }): Promise<string>;
function getPrecomputed(flag, group, code, secret?): Promise<Value>;
function getPrecomputed(flags: readonly Flag[], group, code, secret?): Promise<[...Values]>;
function generatePermutations(flags, filter?: ((values: Record<string, FlagValue>) => boolean) | null, secret?): Promise<string[]>;
function serialize(flags, values: readonly unknown[], secret?): Promise<string>;
function deserialize(flags, code, secret?): Promise<Record<string, FlagValue>>;
function combine(flags, values: readonly unknown[]): Record<string, FlagValue>;
```

Secret order: the `secret` argument, `FLAGS_PRECOMPUTE_SECRET`, the build secret of `withFlags`. It is not `FLAGS_SECRET`. See [precompute.md](precompute.md).

### `FlagValues`

Server component from `@flags-sdk/next/flag-values`. Renders `<script type="application/json" data-flag-values>`.

| Prop         | Type                         | Description                                                           |
| ------------ | ---------------------------- | --------------------------------------------------------------------- |
| `flags`      | `readonly FlagDefinition[]`  | Flags to evaluate for this request.                                   |
| `values`     | `Record<string, JsonValue>`  | Known values, e.g. of `getPrecomputed`. They win over `flags`.        |
| `plain`      | `boolean`                    | No encryption; every visitor can read the values. Default `false`.    |
| `encryption` | `EncryptValuesOptions`       | Options of `encryptFlagValues`, e.g. `method`.                        |

Encrypted by default: with `FLAGS_SECRET` in the v4 format, otherwise with the Vercel public key. It has its own `<Suspense>`. With only `values`, it does not read the request. If encryption fails, it writes nothing and logs a warning; the page does not fail.

### `GET` of `@flags-sdk/next/manifest`

```ts
// app/.well-known/flags/manifest.json/route.ts
export { GET } from '@flags-sdk/next/manifest';
```

Development: the manifest of all `'use flags'` modules, `cache-control: no-store`. Production: 404 by design; the build writes `flags-manifest.json` into `distDir`. Without `withFlags`, the manifest has no flags.

## Other framework packages

| Package                     | Entry points                            | Setup                                                    | Option                          |
| --------------------------- | --------------------------------------- | -------------------------------------------------------- | ------------------------------- |
| `@flags-sdk/sveltekit`      | `/vite` (`flags`), `/binding`           | `plugins: [sveltekit(), flags()]`                        | `disableCodeGeneration` |
| `@flags-sdk/nuxt`           | `.` (module), `/binding`, `/plugin`     | `modules: ['@flags-sdk/nuxt']`                           | `disableCodeGeneration` (config key `flags`, type `FlagsNuxtOptions`) |
| `@flags-sdk/tanstack-start` | `/vite` (`flags`), `/binding`           | `plugins: [nitro(), tanstackStart(), viteReact(), flags()]` | `disableCodeGeneration` |
| `@flags-sdk/vite`           | `.` (`flags`, `MANIFEST_PATH`, `startCodeGeneration`, `resolveAliases`) | For framework packages and other Vite setups | `binding`, `bundle`, `dedupe`, `projectModules`, `disableCodeGeneration`, `manifest`, `root` |
| `@flags-sdk/hono`           | `.` (`flags`)                           | `app.use(flags({ config }))`                             | `config`                        |
| `@flags-sdk/express`        | `.` (`flags`)                           | `app.use(flags({ config }))`                             | `config`                        |

- SvelteKit binding: `getRequestEvent()`; rethrows `redirect()` and `error()`.
- Nuxt module: enables Nitro `experimental.asyncContext`, runs `runtime.onInit()` and `runtime.onShutdown()` with the server, adds `flags/generated.d.ts` to the Nuxt types. Binding: `useEvent()`; rethrows `createError()`.
- TanStack Start binding: `getRequest()`; rethrows `redirect()` and `notFound()`. React and Solid.
- Hono middleware: `runtime.onInvoke(c.req.raw, next)`; passes `HTTPException` through. Hono 4 or newer.
- Express middleware: converts the Node.js request, then `runtime.onInvoke`. Express 4 or newer.
- Hono and Express serve no manifest: run `flags manifest` after the build.

Each `/binding` exports `setupFramework`. The plugin sets the alias; apps do not import it.
