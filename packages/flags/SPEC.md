# Flags SDK v5 spec (draft)

Working notes for the next major version. Not published (`files` only includes `dist`).

`src/playground.test.ts` is a walkthrough of the features, grouped by
feature. Run it with `pnpm test:playground`. When a feature is added or
changed, update the walkthrough in the same change.

## Glossary

The terms of OpenFeature, plus the terms of this SDK. Each term has one
meaning. A document writes the full term the first time, e.g. "the flag
management system (system)".

| Term | Meaning | Examples |
| --- | --- | --- |
| **Flag management system**, short **system** (OpenFeature) | The source of truth of the flags, with a dashboard. | LaunchDarkly, Statsig, Vercel Flags, in-memory |
| **Flag project** | The project in a system. The `project` of a source. | a LaunchDarkly project |
| **Provider** (OpenFeature) | The OpenFeature object which resolves the flags of a system. Only this object. | `VercelProvider`, `TypedInMemoryProvider` |
| **Source** | A provider, plus a flag project, plus the function which creates the evaluation context. The old name was "connection". | `defineSource` |
| **Deployment platform**, short **platform** | Where the application runs. | Vercel, Netlify, Cloudflare |
| **Platform project** | A project on a platform. It has many deployments, in environments such as production and preview. The overrides are scoped to it (`PlatformProject`). | a Vercel project |
| **Deployment** | One build and release of one version of the code of a platform project, e.g. for one commit. | one Vercel deployment |
| **Deployment adapter** | The code of a platform for a framework, e.g. with the Adapter API of Next.js. | the adapter of Vercel for Next.js |
| **Framework binding** | The code of this SDK for one framework. It is the module behind the alias `flags/framework`, with `setupFramework`. | `@flags-sdk/next/binding` |
| **Build plugin** | The part of a framework binding for the bundler. | `withFlags`, `@flags-sdk/vite`, `@flags-sdk/nuxt` |
| **System manifest** | The JSON file of a system, with the templates of the links to its dashboard. | `vercel-flags.json` |
| **Flags manifest** | The JSON file of the flags of an application. | `flags-manifest.json` |
| **Integration** (OpenFeature) | Only in the meaning of OpenFeature: a secondary function, e.g. telemetry. | a hook for tracing |

Vercel is both: Vercel Flags is a system (ID `vercel-flags`), and Vercel is
a platform. By default, Vercel Flags uses the platform project of Vercel as
its flag project. A source can name a different project with
`projectId` and `teamId`, because one project can use the flags of a
different project.

Roles: the roles of OpenFeature (Application Author, Application
Integrator, Provider Author, Integration Author, Library Author), plus the
Framework Author, who writes a framework binding, and the platform, which
writes a deployment adapter.

## Milestones

1. Done: core primitives. Provider types, sources, flags, errors.
2. Done: runtime lifecycle and registration. `runtime`,
   `registerSources`, `registerFlags` (all in `flags/runtime`).
3. Done: request scope. `runtime.onInvoke(request, next)` keeps the request
   with `AsyncLocalStorage`. `getEvaluationContext` runs once per request and
   source.
4. Done: batch evaluation. `evaluate(flag)` and `evaluate([flagA, flagB])`.
5. Done: evaluation context chain. The call side, the flag and the source
   each create a part of the context (see "Evaluation context chain").
6. Done: overrides. Override cookies, trusted with the shared secret
   `FLAGS_SECRET` (the format of v4) or signed by Vercel (see "Overrides").
7. Done: configuration. `runtime.configure` with the optional files
   `flags/hooks.ts` and `flags/config.json`. There is
   no default source: each flag of a provider is declared on its source (see
   "Configuration" and "No default source").
8. Done: flag value types. Boolean, string, number and object flags, with
   typed default values, options and overrides (see "Flag value types").
9. Done: Next.js. `@flags-sdk/next/plugin` and `@flags-sdk/next/binding`, tested in
   `tests/standard/next` with Turbopack and in development (see
   "Framework binding contract"). Only Turbopack is
   supported, not webpack.
10. Done: OpenFeature parity. Hooks, events, tracking, and the report of
    overrides through hooks (see "Hooks, events and tracking").
11. Done: a cache of results for each request (see "The cache of each
    request"), and precompute for Next.js as the separate export
    `@flags-sdk/next/precompute` (see "Precompute").
12. Tooling. Flag discovery for tools such as Flags Explorer (done, see
    "Discovery"), links to the dashboard of the system (done, see "Links
    to the dashboard"), and the overrides from end to end with the Vercel
    Toolbar.
13. Done: more frameworks. A package for each framework (see
    "Packages"): bindings for SvelteKit, Nuxt and TanStack Start, and
    middlewares for Hono and Express,
    each tested in `tests/standard/<framework>` (see "Notes for each
    framework").
14. Done: the standard. `STANDARD.md` has the normative words (MUST,
    SHOULD) of RFC 2119, and `@flags-sdk/conformance` checks framework
    bindings over HTTP. Each app of `tests/standard` runs it. The JSON
    Schema of the flags manifest is
    `https://flags-sdk.dev/schemas/flags-manifest.v1.json`, and
    `validateFlagsManifest` of `flags/manifest` checks a manifest. The provider contract is
    OpenFeature, so the standard of this SDK is the contract between
    frameworks and the SDK: `FlagsRequestInit`, the lifecycle,
    the configuration files, and the format of discovery.
15. Done: one standard with sources. "Source" becomes "source"
    (`defineSource`, `bindFlag`), and code generation from catalogs
    (`flags:<source>`) in each framework with a bundler. The plan is in
    "The move to sources".
16. In progress: flags files. The flags of an application are declared in
    `*.flags` files (`flag <key> { … }` with a JSON5 body), and compiled by the framework loaders, with the
    declaration file next to each flags file, or the content mapper of
    TypeScript 7.1, for the types (see "Flags files").
    The catalogs are removed: the flags files are the only declarations
    of the code generation, and `flags:<source>` stays as the imports by
    source (see "Code generation").

Not planned now: the migration from v4 (later with a skill or a codemod), and
the packages of the monorepo that still use v4.

### Precompute

v5 supports precompute, but not as a part of the runtime or the standard. It
is a feature of Next.js: flags in the proxy, and static pages for each
combination of flags. It is the separate export `@flags-sdk/next/precompute`, so
that users of v4 can keep using it. Ultimately, it belongs in the framework,
built on the standard of this SDK. The usage is in
`../framework-next/README.md`, section "Precompute".

- The API has the names and the signatures of v4: `precompute`,
  `serialize`, `deserialize`, `getPrecomputed`, `generatePermutations` and
  `combine`.
- The format of the code is that of v4: one byte for each flag (the index
  of its option, or a special value for `null`, `false`, `true` and a value
  which is not an option), then the other values as JSON, signed with
  HS256. A test reads a code which v4 created, and v5 creates the same code.
- The secret is `FLAGS_PRECOMPUTE_SECRET`, not `FLAGS_SECRET`: one secret
  for each purpose. `FLAGS_SECRET` encrypts the override cookies. There is
  no fallback to `FLAGS_SECRET`.
- Zero configuration: `withFlags` puts a secret for each build into the
  server code, with `compiler.defineServer` as
  `process.env.__FLAGS_PRECOMPUTE_BUILD_SECRET`. It is
  `FLAGS_PRECOMPUTE_SECRET` of the build, or else a random key. The runtime
  uses `FLAGS_PRECOMPUTE_SECRET`, else the secret of the build.
  - One secret for each build is enough, because a code is only used inside
    one deployment: the proxy rewrites to a static page of the same
    deployment.
  - The value is in the compiled code, so `generateStaticParams` at build
    time, the proxy, `next start` and the functions on Vercel use the same
    secret. `next start` loads the configuration again, and makes a new
    random key, but the compiled code does not change.
  - Next.js can load the configuration more than once during one build,
    e.g. in its workers. The first key is kept in the environment, which
    the workers inherit, so all compilers of one build get the same key.
  - The plugin never sets `__FLAGS_PRECOMPUTE_BUILD_SECRET` in
    `process.env`. Without the plugin, or if the bundler does not inline
    it, the value is `undefined`, and precompute throws. It never uses a
    different key without a warning.
  - `compiler.defineServer` exists since Next.js 15.4.0, so the peer
    dependency is `next >=15.4.0`. It applies only to the Node.js and Edge
    compilers, not to the client. `tests/standard/next` checks that the
    key is in the server chunks of the proxy and of the page, and in no
    file of `.next/static`. It was tested with Turbopack, with `next build`
    and `next start`, with `next dev`, and with the deployment adapter.
  - `next dev` makes a new key when the dev server starts. Old codes are
    then not valid, which is acceptable in development.
  - Set `FLAGS_PRECOMPUTE_SECRET` for the build and for the runtime, or for
    neither. If it is set only at runtime, the proxy and the pages of
    `generateStaticParams` use different secrets.
- To keep the codes of v4 valid during the upgrade, e.g. while v4 and v5
  are deployed at the same time, set `FLAGS_PRECOMPUTE_SECRET` to the value
  of `FLAGS_SECRET` for that time.
- `precompute(flags, { request, evaluationContext, secret })` evaluates the
  flags with `evaluate`. With `request`, it runs in `runtime.onInvoke`, so
  that the context chain and the overrides get the request of the proxy.
- It uses only the public API of the runtime. It is not a framework
  binding, and it needs no alias.
- Changes from v4, which match the rules of v5:
  - A flag is not a function of `(code, group)`. Use `getPrecomputed`.
  - A flag which is not part of the code throws. v4 logged a warning and
    returned `undefined`.
  - `generatePermutations` throws for a flag without options which is not
    a boolean. v4 used `false` and `true` for each flag without options.
  - A code with a wrong signature throws "The precomputed code is not
    valid.", with the error of `jose` as the cause.
- Why a signature: without it, anyone can make a code. A code with any
  JSON value shows text of the attacker on the page (phishing, or XSS if a
  value goes into HTML or a link). Codes without a limit fill the cache of
  pages. And each visitor can choose each combination of options, e.g. an
  unreleased feature. The code is signed, not encrypted: the values are
  readable.
- Other options which were examined: Vercel KMS can not sign, because the
  key pair belongs to Flags Explorer, not to the application. Next.js keeps
  the key of Server Actions in a manifest of the build (with
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` as the override, and a cache of 14
  days in `.next/cache`), but a plugin can not write into that manifest,
  and reading it needs an internal module. A public API of Next.js to
  derive a key for a purpose would be better than the define, and would
  keep codes valid over more than one deployment.

### Tests with real frameworks

`tests/standard/<framework>` contains small apps that test the SDK in a real
framework: `next`, `sveltekit`, `nuxt`, `hono`, `express` and
`tanstack-start`. They test the SDK and its contract, not providers. Each
has `pnpm test:e2e`.

### The move to sources

Milestone 15 joins this SDK with the prototype of `packages/flags-protocol`
(code generation from catalogs). The work happens in this package, in small
steps. After each step, all tests pass: the tests of `flags`, of the
framework packages, and `tests/standard/next`. The old names stayed as
deprecated aliases until the last step (M7), so the framework packages and
the test apps kept working.

| Step | Contents | Status |
| --- | --- | --- |
| M0 | Baseline of the tests | Done |
| M1 | "Source" becomes "source": `defineSource`, `registerSources`, `source` of a flag, `defaultSource` (removed later in M9). `setRequestSource` becomes `setGetRequest` and `setConfigSource` becomes `setLoadConfig`, because "source" now means only a source of flags. Demo `examples/standard/plain`. | Done |
| M2 | `defineFlag({ key, decide })` for inline flags, `bindFlag({ key, source })` for the flags of a source (see "Flags"; now `source.bindFlag(key, options)`) | Done |
| M3 | A value which is not in `options` goes through. The OFREP default source throws (removed later in M9). | Done |
| M4 | Next.js without code generation, with `@flags-sdk/next`. The manifest fields `sources`, `source` and `declarations`. Demo `examples/standard/next-manual`. (M4 also added a transitional Flags Discovery Endpoint of v4, `flags/discovery`. It was removed again: Flags Explorer uses the flags manifest.) | Done |
| M5 | Code generation in `flags/tooling` and the commands `flags sync` and `flags watch`. `flags/sources/<source>/{catalog,provider,context}.ts` (see "Code generation"). | Done |
| M6 | `withFlags({ codeGeneration })` (now on by default, see M10) with the aliases `flags:<source>`. Demo `examples/standard/next-codegen`, and `apps/playground` on the SDK with real Vercel Flags. | Done |
| M7 | Remove the deprecated names. Update the other framework packages and the docs. Remove `packages/flags-protocol`. | Done |
| M8 | The request comes first: `getEvaluationContext(request, input)` and `decide(request, context)`. | Done |
| M9 | Remove the default source: `defaultSource` of the configuration, `flags/default-provider`, the OFREP provider, `Register` and `ConfiguredSource`. Each flag of a provider names its source, by convention `flags/sources/self` (see "No default source"). | Done |
| M10 | Code generation in each framework with a bundler: the option `codeGeneration` of `withFlags`, of the Vite plugins and of the Nuxt module (see "Code generation"). It is now on by default, and the opt-out is `disableCodeGeneration`. The types come from `flags/generated.d.ts`, without a TypeScript setup. | Done |

In M4, the flags manifest changed its fields: `connections` became
`sources`, `source` of a definition became `source`, and `sources` of a
definition (the places in the code) became `declarations`.

## Providers

A provider is any object structurally compatible with the OpenFeature server
`Provider` interface. The SDK does not depend on `@openfeature/*`; it declares
its own minimal types (`Provider`, `EvaluationContext`, `ResolutionDetails`,
`Logger`) which OpenFeature providers satisfy as-is.
`src/openfeature.test.ts` checks these types against `@openfeature/server-sdk`,
which is only a dev dependency.

The SDK calls providers directly instead of going through the OpenFeature
client, so it owns initialization, evaluation and shutdown.

The SDK supports OpenFeature providers as they are. It does not require
providers to implement more than the OpenFeature spec.

### Architecture

All public functions call the `runtime`. For example, a flag calls
`runtime.evaluate`, and `registerSources` calls
`runtime.registerSource`. The runtime owns all state and all behavior.

The package needs Node.js 20.19, or 22.12 or newer (`engines`). The CommonJS
build loads `jose`, an ES module, with `require()`, and the overrides read
`.vercel/project.json` with `process.getBuiltinModule`.

The modules below can be replaced with a bundler alias. The runtime imports them
through its own package name, and the build of the SDK keeps these imports:

| Module            | Default              | Replaced by                                             |
| ----------------- | -------------------- | ------------------------------------------------------- |
| `flags/framework` | no framework binding | a framework plugin, e.g. with `@flags-sdk/next/binding` |
| `flags/hooks`     | no hooks             | a framework plugin, with `flags/hooks.ts`               |
| `flags/settings`  | the defaults         | a framework plugin, with `flags/config.json`            |

`flags/config` is not replaced. It exports `configFromModules`, which builds
the `Config` object from the two modules (see "Configuration"). The
binding imports the two modules itself: it is bundled, so the aliases
apply to its imports, also when a framework loads `flags` from
`node_modules`, e.g. Nitro in `nuxt dev`.

A bundler can put more than one copy of the package into one process, e.g.
one copy for each layer of Next.js. Thus, the state is on `globalThis`, under
`Symbol.for('flags.v5.state')`: the runtime, and the lists of sources and
flags. All copies share it. A source of one copy works with a flag of a
different copy. The key contains the major version, because a different
major version can have a different runtime.

The framework binding is in the shared state too. A copy without the alias
of `flags/framework`, e.g. the copy which the build tool loads for its
plugin, can create the runtime first. Thus, each copy with a binding puts
it into the shared state, and the runtime takes the binding from there,
not from its own copy. The runtime does not store a missing binding, so a
copy which is loaded later still gives its binding. This is necessary for
`vite dev`, where the plugin and the server code run in one process.
`src/shared-binding.test.ts` tests it with two copies of the module in
one process (`vi.resetModules`).

The package exports `evaluate` (see "Evaluating flags with `evaluate`"). It
calls `runtime.evaluate`. Both accept a flag returned by `source.bindFlag`
or `defineFlag`, or a
`FlagDefinition` (`key`, `source`, optional `defaultValue`). Use the
second form to evaluate a key that is only known at runtime. The source
must come from `defineSource`.

### Lifecycle alignment with OpenFeature

The provider contract uses the OpenFeature lifecycle without changes:

| OpenFeature (provider spec)                        | This SDK                                            |
| -------------------------------------------------- | --------------------------------------------------- |
| `initialize(context?, domain?)` (2.4)              | Called by `runtime.onInit`, `onInvoke` or the first evaluation. No context and no domain are passed. |
| Initialized only once, also for several domains    | Initialized only once, also for several sources |
| `shutdown` / `onClose` (2.5)                       | Called by `runtime.onShutdown`                      |
| Re-initialization after shutdown is allowed (2.5.2)| The next use initializes the provider again         |
| Status from events (2.8)                           | Status from the `initialize` promise and from the events of the provider. |
| `on context changed` (2.6)                         | Not used. It is for static-context (client) providers. |
| `track` (2.7)                                      | Called by `track` of this SDK                       |
| No per-request hook                                | None. `runtime.onInvoke` scopes the request in the SDK, not in the provider. |

The `runtime` methods (`onInit`, `onInvoke`, `onShutdown`) are not provider
methods. They are events of the host platform, so they keep their names.

Differences from the OpenFeature client:

- The OpenFeature client registers a provider with `setProvider`, which calls
  `initialize` at once. In serverless functions, this usually happens at
  module scope, which is the Lambda init phase. `runtime.onInit` gives the same
  result.
- The OpenFeature client does not wait for a provider that is not ready. It
  returns the default value with `PROVIDER_NOT_READY`. This SDK waits for the
  initialization, like `setProviderAndWait`. Thus, a cold start does not return
  default values. A timeout for this wait is an open question.
- A provider instance used with this SDK must not also be registered with the
  OpenFeature API (1.8.4). Otherwise, it is initialized and closed two times.

## Sources

A source links flags to a flag project in a flag management system
(system), and to the provider which
evaluates them. "Provider" always means the OpenFeature provider.

```ts
const launchdarkly = defineSource({
  provider: new LaunchDarklyProvider(),
  project: { system: 'launchdarkly', projectId: 'x', teamId: 'y' },
  getEvaluationContext, // optional
});
```

- `project` is optional. It names the flag project for tools, e.g. the
  links of Flags Explorer. Without it, the flags work the same, and the
  flags manifest names no source for them. A system which is not in the
  list, e.g. Statsig, has no `project` until it adds itself.
- `project.system` is one of a fixed list of systems. The system
  determines which other fields are required (`ProjectFieldsBySystem`), e.g.
  `launchdarkly` requires `projectId` and `teamId`, `in-memory` requires none.
  `vercel-flags` has an optional `projectId` and an optional `teamId`, for
  the flags of a different project. Without them, it uses the platform
  project.
- The source is a new frozen object exposing `provider`, `project` and
  `getEvaluationContext`. The provider is not modified.
- `getEvaluationContext(request, context)` is the last step of the
  evaluation context chain (see "Evaluation context chain").
- Several sources can share a provider. It is initialized once.

## Flags

There are two kinds of flags. Both return an async function: `await myFlag()`
or `await myFlag({ evaluationContext })`.

- **A flag of a source**:
  `source.bindFlag(key, { type?, options?, defaultValue?, description?, getEvaluationContext? })`.
  `bindFlag` is a method of the source that `defineSource` returns (the
  type `BindableSource`). The options (the type `BindFlagOptions`) are
  optional. The provider of the source decides the value. The function exposes
  `key`, `type`, `defaultValue`, `options`, `description`, `source` and
  `getEvaluationContext`, so the project is available from every flag.
- **An inline flag**:
  `defineFlag({ key, decide, type?, options?, defaultValue?, description? })`.
  `decide(request, context)` decides the value in the code. It receives the
  current request, or `undefined` outside of a request, and the evaluation
  context of the call side as it is. The type of `context` defines what the
  call side must give. An inline flag has no source of its own: it uses one
  internal source (provider `decide`, no project, so the flags manifest
  names no source for it), so it goes
  through the same steps as a flag of a provider: overrides, hooks, the
  cache of the request, and the check of the type. Its reason is `DECIDE`
  (`DECIDE_REASON`), like `OVERRIDE` for overrides. `decide` together with
  `source` throws.

The type of both is explicit: `type`, `boolean` by default. `options` does
not set the type, because it is optional.

`defineFlag` without `decide` throws, and points to `source.bindFlag(key)`.
`source.bindFlag` with `decide` throws, and points to `defineFlag`. Options
that are not an object throw. The short
forms of earlier drafts (`defineFlag(key)`, `defineFlag(source, key,
defaultValue)`) are removed: each type other than `boolean` is set with
`type`.

- A flag of a provider is declared on its source, so it always has a source
  of `defineSource`. There is no default source (see "No default source").
- Defining a flag registers its source with the runtime. Flags are usually
  defined at module scope, so the runtime knows about their sources before
  `onInit`. `registerSources` is only needed for flags defined later.
- The provider is initialized before its first evaluation. Concurrent
  evaluations share one initialization, and a failed initialization is retried
  on the next evaluation.
- The key keeps its literal type. Any string is accepted. Typed keys (a fixed
  list of keys for each provider) are not planned for now.
- The value has a type (see "Flag value types").
- The context comes from the evaluation context chain (see "Evaluation
  context chain").
- The SDK and the providers use the same logger. Like the default logger of
  OpenFeature, it writes errors and warnings to the console, and ignores info
  and debug messages.
- Errors: a provider can throw, return details with an `errorCode`, or return a
  non-boolean value (`TYPE_MISMATCH`). All are turned into a
  `FlagEvaluationError` with the flag key and an OpenFeature error code
  (`GENERAL` if the error has none). If `defaultValue` is set, the SDK logs
  one line and returns `defaultValue`, e.g. `flags: Could not evaluate flag
  "a": Oops. Returned the default value: false.` The full error goes to the
  debug level. One line keeps the logs small when a flag fails on each
  request. Otherwise the error is thrown.
- Errors of the initialization and of the shutdown are logged with the full
  error, because they occur only once per process.
- Without `defaultValue`, each issue throws a `FlagEvaluationError`: a
  provider that throws, an `errorCode`, the reason `ERROR` (also without an
  `errorCode`), and a value of the wrong type.
- Without `defaultValue`, the SDK passes a placeholder to the provider:
  `false`, `''`, `0` or `{}`, as the type requires. OpenFeature requires a
  default of the correct type, and providers examine it (e.g.
  `TypedInMemoryProvider` throws `TYPE_MISMATCH` for `undefined`). A provider
  that returns its default without any sign of an issue, e.g. for a disabled
  flag of `TypedInMemoryProvider`, then returns the placeholder. The SDK can
  not detect this case: the reasons `DEFAULT` and `DISABLED` can also mean a
  real value of the system. `VercelProvider` reports `DEFAULT` for the
  fallthrough of a flag, and LaunchDarkly reports `DISABLED` with its "off"
  value. Set `defaultValue` when the difference matters.
- A link to the flag in the provider's dashboard (`origin`) will be added
  later.

### Flag value types

```ts
const summerSale = source.bindFlag('summerSale'); // boolean
const bannerText = source.bindFlag('bannerText', { type: 'string' });
const checkout = source.bindFlag('checkout', {
  type: 'string',
  options: [{ value: 'control', label: 'Old' }, 'express'],
  defaultValue: 'control',
}); // 'control' | 'express'
```

- The types are `boolean`, `string`, `number` and `object`, the names of
  OpenFeature. Without `type`, a flag is a boolean. Each other type must be
  set with `type`. The SDK does not infer the type from `defaultValue` or
  `options`.
- A `defaultValue` or options that do not fit the type are type errors. For
  code without TypeScript, `source.bindFlag` and `defineFlag` log a warning, e.g. `The
  defaultValue of flag "a" is not a boolean. Set type to use a different
  type.` An unknown `type` throws.
- `object` means any JSON value, as with `resolveObjectEvaluation` of
  OpenFeature: usually an object or an array, but also a string, a number, a
  boolean or `null`, e.g. for a flag whose variants mix types.
- The type selects the method of the provider: `resolveBooleanEvaluation`,
  `resolveStringEvaluation`, `resolveNumberEvaluation` or
  `resolveObjectEvaluation`. Only the boolean method is required in the type
  `Provider`. A flag of a type that its provider does not support fails.
- The SDK examines each value of the provider. A value of a different type
  fails with `TYPE_MISMATCH`. A provider error without a message gives its
  error code as the message.

#### Options

- `options` lists the values that the flag can have. An option is a value,
  or `{ value, label }`, as in v4. The label is for tools, e.g. Flags
  Explorer. The flag exposes its options as objects with a value.
- Options are for tools, e.g. Flags Explorer and precompute. They do not
  limit the value: the system can add a variant after the deployment, and
  the code must not assume that it knows all variants. A value of the
  correct type which is not one of the options goes through.
- With options, the type of the value is the union of the options and of
  the other values of the type, e.g. `'control' | 'express' | (string & {})`.
  The editor suggests the options, and the type stays true at runtime. For
  `boolean`, it is `boolean`.
- An option of an `object` flag must be `{ value }`, because a JSON value and
  an option object can look the same. Otherwise, `source.bindFlag` throws.
- A `defaultValue` that is not one of the options is a warning at runtime.

#### Overrides and evaluate

- An override must fit the type. It does not need to be one of the
  options. Otherwise, the SDK logs a
  warning, e.g. `The override of flag "a" was ignored, because it is not a
  number.`, and evaluates the flag as usual.
- `evaluate([a, b])` returns the type of each flag, e.g. `[boolean, string]`.

### Evaluating flags with `evaluate`

`evaluate` is a standard function, like `defineFlag`. It calls
`runtime.evaluate`.

```ts
const [banner, flow] = await evaluate([showBanner, newCheckout]);
const enabled = await evaluate(teamFlag, { evaluationContext: { teamId: 'team-1' } });
```

- It accepts one flag or a list of flags. For a list, it returns a tuple with
  the values in the order of the list.
- It accepts flags returned by `source.bindFlag` or `defineFlag`, and plain
  `FlagDefinition`s.
- `evaluationContext` is the input of the call side for each flag. Each flag
  receives the same object, so each step of the chain runs once per request
  for all of them. The flags are evaluated in parallel.
- Each flag that fails returns its `defaultValue` and logs the error. If a
  flag without `defaultValue` fails, the call rejects with its
  `FlagEvaluationError`. Thus, `evaluate([flag])` behaves the same as
  `flag()`.
- A direct call, `await flag()`, is the normal way to evaluate a flag.
  `evaluate` is not faster: each flag is evaluated once per request, and
  calls of many flags in parallel share the work (one evaluation context per
  request, one provider call per flag). It is a convenience for lists.

### Evaluation context chain

Three steps create the evaluation context. Each step receives the result of
the step before, so each step further down can change more:

1. The call side gives `evaluationContext`: `myFlag({ evaluationContext })` or
   `evaluate(flags, { evaluationContext })`.
2. `getEvaluationContext(request, context)` of the flag receives it and
   returns the context for the source.
3. `getEvaluationContext(request, context)` of the source receives that
   and returns the context for the provider.

```ts
const source = defineSource({
  provider,
  project: { system: 'in-memory' },
  getEvaluationContext: async (request, context: { teamId: string }) => ({
    team: await loadTeam(context.teamId),
    user: request?.headers.get('x-user') ?? null,
  }),
});

const teamInsights = source.bindFlag('teamInsights');

// API route GET /api/teams/:teamId: the route knows the team
await teamInsights({ evaluationContext: { teamId: params.teamId } });
```

- A missing step gives its input to the next step as it is. Without any step
  and without input, the provider receives an empty context.
- There is no automatic merge. A step that wants to keep fields of the step
  before returns `{ ...context, ... }`.
- `request` is the first argument of each step, also when the step does
  not use it. It is the current `FlagsRequest` (see "The request"). It is
  `undefined` outside of a request. The steps run also outside of a request, e.g. in scripts, because
  the provider needs the context in the shape that the last step creates.
- The SDK calls each step with the step's owner as `this`: the flag or the
  source.

#### Cache

- Inside a request, each step runs once for each input. A second call with
  the same input, or without input, uses the first result.
  `evaluate([a, b], { evaluationContext })` gives the same object to each
  flag, so the step of a shared source runs once.
- Plain data is compared by its content: primitives, arrays and plain
  objects. Thus, `{ teamId: 't1' }` in two server components is one input,
  also with the keys in a different order. The key is a stable JSON string
  (`fast-json-stable-stringify`, without dependencies).
- Other objects are compared by identity: a `Date`, a `Map`, an instance of
  a class, a function, or an object which contains one of them, and
  circular objects. The SDK can not compare them safely, so it does not
  guess. Example: `{ since: new Date(0) }` two times is two inputs.
- Outside of a request, the steps run on each evaluation.
- If a step throws, the flags that use its result fail for the rest of the
  request. They return `defaultValue` or throw a `FlagEvaluationError`.

#### Types

- The type of `context` of a step defines the input that the step needs. The
  return type defines what the next step receives.
- The source: `SourceInput<C>` is what its flags must give. Without a
  step, it is `DefaultSourceInput` (`EvaluationContext | undefined`).
- The flag: its step must return `SourceInput<C>`. The type of its
  `context` is what the call side must give (`FlagEvaluationContext<F>`).
  Without a step, the call side must give `SourceInput<C>`.
- The call side: the options are optional if the input can be `undefined`.
  Otherwise `evaluationContext` is required.
- `evaluate` with several flags requires the overlap (intersection) of their
  inputs (`EvaluateContext<F>`), because each flag receives the same object.
- No field has a special meaning, also not `targetingKey`. Not all providers
  use it. A source that needs it declares it.

## Hooks, events and tracking

The SDK calls providers directly, without the OpenFeature client. Thus, it
does the work of the client itself: it runs hooks, listens to events, and
calls `track`.

### Hooks

A hook is an OpenFeature `Hook`, with the stages `before`, `after`, `error`
and `finally`. Hooks come from four places. They run in the order of
OpenFeature:

| OpenFeature   | This SDK                                  |
| ------------- | ----------------------------------------- |
| API           | `hooks` of the configuration: `flags/hooks.ts` |
| Client        | `hooks` of `defineSource`, or `flags/sources/<source>/hooks.ts` |
| Invocation    | `flag({ hooks, hookHints })`, `evaluate`  |
| Provider      | `provider.hooks`                          |

- `before` runs from the first hook to the last. `after`, `error` and
  `finally` run from the last hook to the first.
- `before` can return a context. The SDK merges it into a new object, so
  the context of the request does not change. The next hooks and the
  provider receive the merged context.
- Each hook has its own `hookData` during one evaluation.
- An error of `before` or `after` fails the evaluation: `error` and
  `finally` run, then the flag returns its `defaultValue` or throws. An
  error of `error` or `finally` is logged, and does not change the result.
- `finally` receives the evaluation details. After an error, they have the
  reason `ERROR`, the error code, and the `defaultValue` (or the
  placeholder).
- Hooks run when the evaluation context exists. An error before that, e.g.
  in `getEvaluationContext`, or a type which the provider does not support,
  runs no hooks.
- In `hookContext`, `defaultValue` is the placeholder for a flag without a
  `defaultValue`. `clientMetadata` has `sdk: 'js-server'`, `paradigm:
  'server'` and the metadata of the provider. There is no domain.

### The report of overrides

An override does not call the provider, but all hooks run, also the hooks
of the provider. The evaluation details have the reason `OVERRIDE`
(`OVERRIDE_REASON`). Thus, a hook of a provider knows about overrides, e.g.
to remove them from the exposures of an experiment. A hook which does not
check the reason counts an override as a usual evaluation.

An application reports overrides with a hook, e.g. to the system of an
experiment:

```ts
// flags/hooks.ts
const hooks: Hook[] = [
  {
    after(hookContext, details) {
      if (details.reason === OVERRIDE_REASON) {
        report(hookContext.flagKey);
      }
    },
  },
];

export default hooks;
```

Without hooks, an override does not create the evaluation context, as
before.

### Events

The runtime listens to `provider.events` from the first initialization
until the shutdown.

- `runtime.addHandler(event, handler)` and `runtime.removeHandler` work like
  `OpenFeature.addHandler`. The handlers receive the events of all
  providers, with `providerName`. The events are `PROVIDER_READY`,
  `PROVIDER_ERROR`, `PROVIDER_CONFIGURATION_CHANGED` and `PROVIDER_STALE`.
- The runtime emits `PROVIDER_READY` when `initialize` resolves, and
  `PROVIDER_ERROR` when it rejects, as the OpenFeature SDK does.
- A handler for the current status of a provider runs at once (OpenFeature
  5.3.3), e.g. `PROVIDER_READY` for a provider which is ready.
- An error of a handler is logged.
- The status is `READY`, `ERROR`, `STALE` or `FATAL`. Only `FATAL` changes
  the evaluation: a `PROVIDER_ERROR` with the error code `PROVIDER_FATAL`,
  or an initialization which rejects with the code `PROVIDER_FATAL`, makes
  each next evaluation fail with `PROVIDER_FATAL`. The runtime does not
  initialize the provider again until `onShutdown`. `ERROR` and `STALE` do
  not stop evaluations, as in OpenFeature.
- Handlers for one source (the client level of OpenFeature) are not
  supported. A handler can filter by `providerName`.

### Tracking

`track(source, eventName, options?)` gives a tracking event to
`provider.track`, e.g. a purchase for an experiment. The source is
required.

```ts
await track(launchdarkly, 'purchase', {
  evaluationContext: { userId: 'alice' },
  details: { value: 99 },
});
```

- The evaluation context comes from the chain without the flag step: the
  call side gives `evaluationContext` to `getEvaluationContext` of the
  source. It runs once per request, as for flags.
- `track` waits for the initialization of the provider. OpenFeature does
  not call `track` of a provider which is not ready.
- A provider without `track` ignores the event.
- Errors are logged, not thrown. Only a call without a source, or with a
  name which is not a string, throws.

## Configuration

`runtime.configure(config)` configures the SDK. The configuration is
optional. Each part has one optional file in the folder `flags` (in the
directory of the application or in `src`). The framework binding loads the
files, builds the configuration with `configFromModules` of `flags/config`,
and calls `runtime.configure`
with the result. Without a framework, the application calls it at startup.

| File | Part of `Config` | Read by |
| --- | --- | --- |
| `flags/hooks.ts` | `hooks`: the default export, OpenFeature hooks for all flags (see "Hooks, events and tracking") | the application |
| `flags/config.json` | `settings`: the static settings (`Settings`), e.g. which override tokens the SDK accepts (see "Overrides") | the plugins, the CLI and the application |
| `flags/sources/<source>/hooks.ts` | the hooks of one source, for `defineSource({ hooks })` | the application |

```ts
// flags/hooks.ts
import type { Hook } from 'flags';

const hooks: Hook[] = [loggingHook];

export default hooks;
```

```jsonc
// flags/config.json
{
  "$schema": "https://flags-sdk.dev/schemas/config.v1.json",
  "selfSource": false,
  "overrides": { "vercel": { "maxLifetimeSeconds": 2592000 } }
}
```

- Each setting has exactly one place. The code files run only in the
  application. Only the JSON file is static, so every tool can read it.
  A source has only code files of the application: `provider.ts`,
  `context.ts` and `hooks.ts`.
- `settings`: the settings are `selfSource` (a boolean, the default is
  `true`, see "The source" of "Flags files") and `overrides`
  (`OverridesOptions`, see "Overrides"). The check is strict: an unknown
  key or a wrong type is an error, in the plugins, in the CLI and in
  `runtime.configure`. `$schema` is allowed. The JSON Schema is
  `https://flags-sdk.dev/schemas/config.v1.json`.
- The plugins alias `flags/hooks` and `flags/settings` to
  the files (`findConfigModules` of `flags/tooling`). Without a file, the
  alias is not set, and the empty module of `flags` applies.
  `configFromModules` returns the same object while the files do not change, so
  the runtime does not configure again in development without a change.
- Frameworks without a bundler (Hono, Express, plain Node.js) call
  `runtime.configure({ hooks, settings })` themselves, with the content of
  `flags/config.json` as `settings` if necessary. `flags sync` and
  `flags watch` read it anyway.
- `Config` has no `overrides`. `runtime.configure({ overrides })` throws:
  "The overrides are a setting of flags/config.json. Use
  runtime.configure({ settings: { overrides } })."
- The configuration has no source. `defaultSource` throws: "The
  configuration has no defaultSource. Give each flag its source, e.g. with
  flags/sources/self."
- `runtime.configure` validates the full configuration at once, and throws
  before it changes anything. A new call replaces the configuration, e.g.
  after a reload in development.
- `test/register` checks the pattern of `flags/hooks.ts` with its own
  TypeScript program, as part of `type-check`: a flag of a provider needs
  its source, and the configuration has no `defaultSource`.

## No default source

There is no default mechanism for now. Each flag of a provider is declared
on its source, with `source.bindFlag(key)`, so it cannot lack a source. A
`FlagDefinition` without a source fails at the evaluation.

- By convention, the main source of an application is `flags/sources/self`,
  with `provider.ts` and an optional `context.ts`. The flags of the source
  are declared in flags files (see "Flags files"). The application imports
  them from the file, or from `flags:self`:

  ```ts
  import { summerSale } from 'flags:self';
  ```

- Without flags files, the application writes the same source by hand,
  e.g. in `flags/self.ts`, and declares each flag with `self.bindFlag(key)`.
- `flags` exports nothing for Vercel, and there is no wrapper package. The
  application uses the OpenFeature provider of Vercel Flags directly:
  `VercelProvider` of `@vercel/flags-core/openfeature`, like each other
  OpenFeature provider, e.g. in `flags/sources/self/provider.ts`.
- The default is on the level of the files, not in the configuration: an
  application which depends on `@vercel/flags-core` has the default source
  `self` of Vercel Flags in its flags files, with the provider
  `VercelProvider` (see "The source" of "Flags files"). The runtime still
  has no default source: each flag is declared on its source.

Earlier drafts had a `defaultSource` in the configuration, a built-in
default source with the module `flags/default-provider`, a replacement of
that module with a bundler alias of the platform, and an internal OFREP
provider. They are removed.

## Overrides

An override sets the value of a flag for one browser, e.g. from the Vercel
Toolbar. It comes from a cookie of the request. The SDK accepts only trusted
overrides: encrypted with a shared secret, or signed by Vercel.

- The cookie is `flag-overrides`. The SDK also reads `vercel-flag-overrides`,
  the cookie of v4. If both are set, `flag-overrides` wins. A cookie contains
  one token, so the SDK never merges overrides.
- An override for the key of a flag replaces the evaluation. The SDK does not
  call the provider, does not wait for its initialization, and does not run
  the evaluation context chain.
- The value must have the type of the flag. Otherwise, the SDK logs a
  warning and evaluates the flag as usual (see "Overrides and evaluate").
- The SDK reads the token once per request. Outside of a request, there are
  no overrides.
- An invalid token gives no overrides. The SDK logs one warning with the
  reason, e.g. `flags: The override cookie was ignored. Reason: wrong-scope.`
  It never logs the token, because the token can contain information about
  the user.

### Which tokens the SDK accepts

The SDK needs no configuration:

1. If `FLAGS_SECRET` is set, the SDK accepts the tokens of this shared
   secret. This is the behavior of v4.
2. On Vercel or locally with a linked project (when `VERCEL` is set, or the
   host has an OIDC token: from the request, or `VERCEL_OIDC_TOKEN`), the
   SDK accepts the tokens that Vercel signs for this project, also with a
   `FLAGS_SECRET`. Locally, Flags Explorer signs them, and
   `vercel env pull` writes `VERCEL_OIDC_TOKEN`.
3. Otherwise, the SDK accepts no tokens.

The SDK reads these environment variables when a token needs them, because
they can change until then. An empty variable counts as missing.

The setting `overrides` of `flags/config.json` (`OverridesOptions`, see
"Configuration") changes the defaults. All its options are JSON. The trust
comes only from the options and the environment, never from the token.

- `secret`: only `false`, which accepts no tokens of the shared secret. The
  secret itself comes only from `FLAGS_SECRET`, never from the file. A
  string is an error: "overrides.secret in flags/config.json can only be
  false. Set the secret with the environment variable FLAGS_SECRET."
- `vercel`: `true` accepts signed tokens with the defaults, an object sets
  options, and `false` accepts no signed tokens. With an explicit value,
  signed tokens are accepted also outside of Vercel, e.g. with a test
  issuer. Explicit options are validated at once.

The format of the token only selects the method: three parts for a signed
token (JWS), five parts for an encrypted token (JWE). Each method verifies the
token completely. An invalid token never goes to a different method.

The protocol (cookie names, claims, limits) is in this spec. The package does
not export it as constants, so that it is not a part of the public API.

### Shared secret

- The format is the same as in v4: a JWE with direct encryption (A256GCM), the
  purpose claim `overrides`, the overrides in the claim `o`, and an
  expiration. Thus, the Vercel Toolbar of today and existing tests work.
- `encryptOverrides(overrides, secret?, expirationTime?)` creates a token,
  e.g. in tests or CI. The default secret is `FLAGS_SECRET`, and the default
  expiration is one year.
- `decryptOverrides(token, secret?)` reads a token. It returns `undefined` for
  a token that is not valid, and throws if the secret is missing or not
  valid. Both functions have the signature of v4.
- Anyone with the secret can create overrides. Use a different secret for each
  application, unless the applications must share their overrides.
- The `plaintext` mode of v4 (`overrideEncryptionMode`) is not supported,
  because the SDK must not trust a cookie that is not encrypted or signed.

### Signed by Vercel

This follows the RFC "Vercel flag overrides without a required shared
secret". Vercel, e.g. the Vercel Toolbar with Vercel KMS, signs the token.
The application verifies it with the public keys of the issuer. It needs no
secret and no configuration.

- The issuer is the signer of the Vercel Toolbar in Vercel KMS. The option
  `issuer` replaces it, e.g. for a local test issuer. `jwksUrl` is
  `<issuer>/jwks.json`. Both must use HTTPS. `allowInsecureLocalhost` allows
  `http://localhost` for a local test issuer.
- The issuer in the code is the official issuer of the overrides in Vercel
  KMS (`https://kms.vercel.com/64af96a2-ba60-42ef-91af-459fcef6f864`). It
  signs with ES256. The SDK also accepts RS512, which the earlier test
  issuer used.
- The project of the host comes from the configuration, never from the token
  or from a header:
  - `projectId`: the option, else `VERCEL_PROJECT_ID`, else the claim
    `project_id` of `VERCEL_OIDC_TOKEN`, else the `.vercel/project.json` of
    `vercel link`.
  - `environment`: the option, else `VERCEL_TARGET_ENV`, else `VERCEL_ENV`,
    else the claim `environment` of `VERCEL_OIDC_TOKEN`, else `development`
    when the project is linked and `NODE_ENV` is `development`.
  - `teamId`: the option, else the claim `owner_id` of `VERCEL_OIDC_TOKEN`,
    else the `orgId` of `.vercel/project.json`. The SDK compares the team only
    when it knows it. A project ID is unique on all of Vercel, so the project
    ID and the environment identify the host.
  - The SDK decodes `VERCEL_OIDC_TOKEN`, but does not verify it. The token is
    part of the configuration of the host, like the other environment
    variables, not an input of a request. Its claims stay correct also when
    it is expired. On a deployment, Vercel adds the token to each request as
    the header `x-vercel-oidc-token`, and the SDK reads it from the request
    context first. A visitor can not set this header: Vercel removes it from
    each incoming request.
  - If the project ID or the environment is not known, the SDK throws an
    `OverridesError`.
- The token is a JWT with these claims: `iss` (the issuer), `aud`
  (`vercel:flag-overrides`), `ver` (`1`), `pur` (`flag-overrides`), `iat`,
  `exp`, `scope` (`projectIds`, `environments`, optional `teamId`) and
  `overrides`. `projectIds` is a list, so that all projects of a
  microfrontends group share one cookie. A scope with a single `projectId`,
  or with another key, is rejected.
- The SDK verifies: the algorithm (ES256 or RS512), the signature, the
  issuer, the audience, the time (5 seconds of tolerance), the lifetime, the
  version, the purpose, and that the overrides are JSON. The scope must have
  the project and the environment of the host, and its team if known.
- The lifetime (`exp - iat`) is at most 7 days. `maxLifetimeSeconds`
  changes it.
- On Vercel, the SDK accepts signed tokens also when `FLAGS_SECRET` is set:
  the Vercel Toolbar can create both kinds of tokens.
- `signOverrides(overrides, { ttl })` asks Vercel to sign overrides with the
  OIDC token of the host, e.g. for end-to-end tests without a
  `FLAGS_SECRET`. The token is for the project and the environment of the
  OIDC token.
- The header must have a `kid`. A key or a URL in the header (`jwk`, `jku`,
  `x5u`) is never used, and the token is rejected.
- The payload can be read by anyone. It is signed, but not encrypted. Do not
  put secret information into it.

The public keys:

- The SDK loads them on the first signed token, and keeps them for the
  process. Requests without a signed token load no keys.
- Concurrent loads share one request. The load has no timeout. The keys stay
  valid for 5 minutes (`cacheMaxAgeMs`).
- If the keys can not be loaded, the SDK throws an `OverridesError`, and the
  flags of the request fail: they return their `defaultValue` or throw.
  Overrides are a tool for development, so a visible error is better than a
  silent one. The next request loads the keys again.
- A `kid` that is not known loads the keys again, but at most once in 30
  seconds (`cooldownMs`). Thus, tokens with random `kid`s can not cause many
  requests. If the key is still not known, the token is rejected
  (`unknown-key`).
- The key set can have at most 100 keys and 64 KB. It must not contain
  private or secret keys.
- The SDK never accepts a token that it can not verify.

## Runtime lifecycle

The SDK exports one `runtime` instance. It coordinates the providers of all
sources. An application has only one runtime, so `Runtime` is exported
only as a type. The lifecycle methods map to the AWS Lambda phases. Framework
bindings call them.

- `onInit()`: call once before the first request (Lambda init phase). It
  initializes the providers of all registered sources in parallel, and
  waits for them. It logs failures and does not throw. Use `initialize()` for
  local work, e.g. to parse an embedded fallback configuration. Do not rely on
  sources that you open here: Lambda can freeze the process between
  requests.
- `onInvoke(request, next)`: call for each request, e.g. in a middleware.
  Pass the request of the framework and the function that continues to handle
  the request, e.g. `next`. It returns the result of `next`. Flags that are
  evaluated while `next` runs belong to the request (see "Request scope").
  `onInvoke` starts the initialization of providers that are not initialized,
  and retries failed initializations. It does not wait for this work: a
  request can use only some of the providers, and a slow provider must not
  delay the flags of a different provider. The evaluation of a flag reports
  errors.
- A flag waits only for the provider of its source. If the initialization
  of that provider is in progress, the flag waits for it before it calls the
  provider.
- `waitForInitialization()`: waits until all running initializations are
  finished. It does not throw.
- `onShutdown()`: call once when the process stops. It waits for running
  initializations, then calls `onClose()` on each provider that was
  initialized. It logs errors and does not throw. After a shutdown, the next
  use initializes the providers again.
- A provider is initialized only once, also when several sources share
  it. Concurrent callers share one initialization. `initialize()` is called
  synchronously, so the work starts immediately.
- The provider of a source that is not registered is initialized on its
  first evaluation.

### The request

Frameworks give different requests. Next.js gives only `headers()` and
`cookies()`, and no full request. Hono, SvelteKit and TanStack Start give a
Web `Request`. Express gives a Node.js `IncomingMessage`. Extensions of the
SDK, e.g. overrides from cookies or headers, need one standard that they can
rely on. Thus, the SDK has two types:

```ts
// What a framework gives: each property is optional. A Web Request fits.
interface FlagsRequestInit {
  readonly headers?: ReadonlyHeaders;
  readonly cookies?: ReadonlyRequestCookies;
  readonly url?: string | URL;
}

// What each step and each extension receives: the same for each framework.
interface FlagsRequest {
  readonly headers: ReadonlyHeaders | undefined;
  readonly cookies: ReadonlyRequestCookies | undefined;
  readonly url: Readonly<URL> | undefined;
}
```

- The framework gives what it can. The SDK creates the `FlagsRequest` from it.
- All properties can be read, but not modified. A property is `undefined`
  when the framework can not give it.
- `cookies` are the cookies of the framework. If the framework gives no
  cookies, but headers, they come from the `Cookie` header. Thus,
  `request.cookies` works with each framework. Their shape agrees with the
  cookies of Next.js. If a name occurs two times, the first cookie wins,
  because browsers send the most specific cookie first.
- `url` is a `URL`, made from the string or the `URL` of the framework. It
  must be a full URL. Otherwise, reading it throws a `TypeError`.
- The SDK reads each property only when a step uses it.
- Each step of a request receives the same `FlagsRequest` object.
- The standard has no other properties. A framework that can give more
  information gives it through the context chain, not through the request.

#### How the runtime gets the request

1. `runtime.onInvoke(request, next)`: for frameworks with a middleware that
   wraps the handler, e.g. Hono, Express and SvelteKit (`handle`). The SDK
   keeps the request with `AsyncLocalStorage` while `next` runs. Work that
   `next` starts keeps the scope, also after `next` returns, e.g. in Express.
   This is similar to transaction context propagation in OpenFeature. The SDK
   does not use `enterWith`, because it changes the context of the caller.
2. `runtime.setGetRequest(source)`: for frameworks that can give the
   current request at any time, but have no middleware that wraps the
   handler, e.g. Next.js. The source returns the current request, or
   `undefined` outside of a request. It can be async.

- The SDK identifies a request by its `headers` object. The framework must
  give the same `headers` object during one request. The object which the
  source returns can be new on each call. Next.js meets this rule: `headers()`
  returns the same object during one request. Thus, a `WeakMap` with the
  `headers` as key works like `AsyncLocalStorage`. Without `headers`, the
  source must return the same object during one request.
- Inside `onInvoke`, the request of `onInvoke` is used, and the source is not
  called.
- If the source throws, the evaluation fails. A source returns `undefined`
  outside of a request, and does not throw.
- Each evaluation outside of `onInvoke` calls the source, also for flags
  without steps. This is correct: flags are dynamic by definition, and
  overrides will read the cookies of each request. In Next.js, this makes the
  page dynamic, as expected.
- The request scope holds the cache of the evaluation context chain and the
  cache of the results.
- A flag waits for the initialization of its provider. It gets the context at
  the same time.

#### The cache of each request

During one request, the SDK evaluates each flag one time for each input of
the call side. Thus, all components of a page get the same value, also when
the configuration of the provider changes during the request, and the
provider gets fewer calls.

- The key is the flag object and the `evaluationContext` of the call side.
  Plain data is compared by its content, other objects by identity, as for
  the steps of the chain (see "Cache" in "Evaluation context chain"). Two
  flags with the same key are two flags. A plain
  `FlagDefinition` which the call side creates for each call is not cached.
- `flag()`, `evaluate(flag)` and `evaluate([flag])` share the cache.
- The cache keeps the promise. Concurrent calls share one evaluation.
- The cache also keeps a failure. A flag with `defaultValue` logs one line
  for each request, and a flag without `defaultValue` throws the same error
  again.
- A result of the cache runs no hooks, because the SDK does not evaluate the
  flag again. Thus, a hook which records exposures records one exposure for
  each request, flag and input.
- A call with its own `hooks` or `hookHints` skips the cache. It gets its own
  evaluation, so that its hooks run. It does not change the cache.
- Outside of a request, e.g. in a script, there is no cache. Each call
  evaluates the flag.
- The cache ends with the request. Nothing is shared between requests.

## Packages

`flags` is the shared runtime and its functions, without code for a
framework or a bundler. Each framework has its own package, which can
depend on its framework. A framework can vendor its package later, or
provide the same itself.

| Package | Contents | Used by |
| --- | --- | --- |
| `flags` | `defineFlag`, `defineSource` (with `source.bindFlag`), `evaluate`, `track`, the errors, the reasons and the types; `flags/runtime`, `flags/explorer`, `flags/manifest`, `flags/tooling`, the command line `flags` | the application, and the framework packages |
| `@flags-sdk/next` | `/binding`, `/plugin` (`withFlags`), `/precompute`, `/manifest` (the route), and the loaders of Turbopack | `next.config.ts`, `proxy.ts`, one route file |
| `@flags-sdk/vite` | the generic Vite plugin: the binding, the configuration files, `'use flags'` modules, the manifest, the code generation | the framework packages for Vite |
| `@flags-sdk/sveltekit` | `/binding`, `/vite` | `vite.config.ts` |
| `@flags-sdk/nuxt` | the module, `/binding`, `/plugin` (Nitro) | `nuxt.config.ts` |
| `@flags-sdk/tanstack-start` | `/binding`, `/vite` | `vite.config.ts` |
| `@flags-sdk/hono` | the middleware | the setup of the app |
| `@flags-sdk/express` | the middleware | the setup of the app |

- The main export `flags` has the API of the application: `defineSource`,
  `defineFlag`, `evaluate`, `track`, `FlagEvaluationError`,
  `DECIDE_REASON`, `OVERRIDE_REASON` and the types.
- `flags/runtime` has `runtime`, `registerFlags`, `registerSources` and the
  types `Config`, `Settings`, `SetupFramework`, `GetRequest`, `LoadConfig`,
  `Runtime`, `OverridesOptions`, `VercelOverridesOptions` and
  `PlatformProject`. It is for framework bindings and for applications
  without a framework plugin (Express, Hono, plain Node.js). All copies of
  the package share one runtime.
- `flags/explorer` has the protocol of Flags Explorer:
  `encryptFlagValues`, `decryptFlagValues`, `serializeFlagValues`,
  `encryptOverrides`, `decryptOverrides`, `signOverrides`, `OverridesError`
  and the types `FlagValuesType`, `EncryptFlagValuesOptions`,
  `OverrideRejection` and `FlagOverrides`.
- The code of the application imports only `flags`. The framework packages
  are only for the setup, one time. Precompute of Next.js is the
  exception: it is a feature of Next.js, so its pages and its proxy import
  `@flags-sdk/next/precompute`.
- A framework package imports its framework, e.g. `isRedirect` of
  `@sveltejs/kit`, and has a peer dependency on it. A framework package
  only uses the public API of `flags`.
- `flags/tooling` is the public API for framework packages and build tools:
  `findFlagsModules`, `hasUseFlagsDirective`, `addSelfRegistration`,
  `writeManifestFromBuild`, `MANIFEST_FILE`, `findConfigModules`,
  `readSettings`, `optionIndex`, `registerFramework`, and the code
  generation: `generateFlags`, `watchFlags`, `renderSourceModule`,
  `findGeneratedDeclarations` and `GENERATED_DIRECTORY` (see "Code
  generation"). It is part of the
  contract of a framework binding.
- `registerFramework(setupFramework)` registers a binding without the
  alias of `flags/framework`, for a runtime which loads `flags` from
  `node_modules`, e.g. Nitro in development. The first binding wins, as
  with the alias.

## Framework binding contract

A framework binding connects the SDK to a framework. It has two parts:

1. **A build plugin**, e.g. `withFlags` of `@flags-sdk/next/plugin`. It sets
   these bundler aliases:
   - `flags/framework` to the module of the binding, e.g. `@flags-sdk/next/binding`.
   - `flags/hooks` and `flags/settings` to `flags/hooks.ts` and
     `flags/config.json` of the application, each only if the file exists.
2. **The module of the binding** behind `flags/framework`. It exports
   `setupFramework(runtime)`, which the runtime calls one time, before the
   first evaluation and in `onInit`.

The application does not import the module of the binding. The runtime
imports `flags/framework` itself, so the binding works in each bundle
that uses `flags`. Without a plugin, `flags/framework`, `flags/hooks`
and `flags/settings` are empty modules.

The module of the binding:

- must not import `flags` or `flags/runtime` statically, because `flags`
  imports it. It gets
  the runtime as an argument.
- loads the configuration with dynamic imports of `flags/hooks` and
  `flags/settings`, and builds it with
  `configFromModules` of `flags/config`. The imports are dynamic because
  `flags/hooks.ts` can import `flags`, and they are in the binding, so that
  the aliases apply.
- uses only the public API of the SDK, so that a framework can take it over,
  e.g. as its own module behind the same alias.

`setupFramework` uses these methods of the runtime:

| Method                           | Purpose                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `runtime.setGetRequest(fn)`   | Gives the current request, if no middleware wraps the handler (see "The request")          |
| `runtime.setLoadConfig(fn)`    | Gives the configuration. In development, the runtime loads it again before each evaluation |
| `runtime.setRethrow(fn)`         | Throws the errors again which the framework must receive                                    |

- `setLoadConfig`: in production, the runtime calls it one time. In
  development (`NODE_ENV` is not `production`), it calls it before each
  evaluation, and configures again when it returns a different object. Thus,
  a change of `flags/hooks.ts` or `flags/config.json` applies without a restart. If the source
  throws, the evaluation fails, and the next one tries again.
- `setRethrow`: some frameworks use errors as signals, e.g. Next.js to stop
  the static rendering, or to postpone a part of a page. The SDK must never
  catch such an error. The runtime calls the function first when an
  evaluation fails, before it uses the `defaultValue` and before it wraps the
  error. This covers errors of the request source, of steps of the context
  chain, and of providers. Without it, a flag of a page that Next.js tries to
  render statically breaks the build.

The tasks of a binding:

| Task                                   | With a framework                                                                            | Without a framework                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Load the configuration files           | The plugin sets the aliases of the files, the binding calls `setLoadConfig`              | `runtime.configure({ hooks, settings })` at startup        |
| Give the request to the runtime        | `runtime.onInvoke(request, next)` in a middleware, or `setGetRequest`                    | `runtime.onInvoke` in a middleware                         |
| Convert the request                    | The binding gives `FlagsRequestInit`, e.g. a Web `Request`                                  | The application converts it, e.g. Node.js headers          |
| Let signals of the framework through   | `setRethrow`                                                                                | Not necessary                                              |
| `onInit` and `onShutdown`              | At startup, and when the process stops, if the framework has such hooks                     | At startup, and on `SIGTERM`                               |
| Generate `flags:<source>`              | The plugin, by default (see "Code generation")                                              | `flags sync`, and an import of `./.flags/<source>.ts`      |
| Register `'use flags'` modules         | A compiler plugin calls `registerFlags` (see "Discovery")                                   | `registerFlags` by hand, if necessary                      |

Rules for each binding:

- Use only the default export of `flags/hooks.ts` and `flags/config.json`,
  through `configFromModules`.
- Give the request as `FlagsRequestInit`. Give the same `headers` object
  during one request.
- Set the aliases for each bundler that the framework supports. For
  Next.js, the SDK supports only Turbopack.
- Make an evaluation part of the render at request time, if the framework
  prerenders. The Next.js binding waits for `connection()` in its request
  source. Thus, a provider can call `Date.now()` or do I/O, also with
  `cacheComponents` and Partial Prefetching. `connection()` gives one
  promise for each request, so this adds no work. `getPrecomputed` does not
  use the request, so a precomputed page stays static.
- Do not let an evaluation run in a cache scope (`'use cache'`). A flag
  value must not be cached: the application evaluates the flag outside,
  and passes the value in. The Next.js binding finds a cache scope by the
  message of the error of `headers()`, because Next.js has no public API
  for it. It throws a `FlagInCacheError`, and its rethrow throws it again,
  so that the flag does not return its `defaultValue`.

### Notes for each framework

The details must be checked when the binding is built (milestone 13).

**Next.js** (done). The guide for users and for the authors of the
binding is `../framework-next/README.md`. The contract for framework
authors is `FRAMEWORK-AUTHORS.md`.

```ts
// next.config.ts
import { withFlags } from '@flags-sdk/next/plugin';

export default withFlags({ /* the configuration of Next.js */ });
```

| Path                    | Content                                                          | Used by                    |
| ----------------------- | ---------------------------------------------------------------- | -------------------------- |
| `@flags-sdk/next/plugin`     | `withFlags(nextConfig, { dir?, disableCodeGeneration? })`, the build plugin | `next.config.ts`        |
| `@flags-sdk/next/binding`            | `setupFramework`, the module of the binding                     | the alias, not the app     |
| `@flags-sdk/next/precompute` | precompute, for the transition (milestone 11)                     | the proxy and pages        |

- `withFlags` sets the aliases for Turbopack (`turbopack.resolveAlias`). It
  supports only Turbopack: its `webpack` function throws, so a build with
  `--webpack` stops with a clear error. It keeps the aliases and the rules
  of the application. It finds
  `flags/hooks.ts` (`.ts`, `.mts`, `.js` or `.mjs`) and `flags/config.json` in the directory of the application or in `src`.
- The request: no middleware wraps the rendering, but `headers()` returns the
  same object during one request. Thus, `@flags-sdk/next/binding` uses
  `runtime.setGetRequest` with `headers()` and `cookies()`. The test shows
  one call of `getEvaluationContext` for five evaluations in one request.
- Outside of a request, e.g. at build time, `headers()` throws, so the source
  returns `undefined`. The static page of the test evaluates with the user
  `anonymous`.
- Signals: `@flags-sdk/next/binding` sets `runtime.setRethrow(unstable_rethrow)`. During
  the build, `headers()` throws "Dynamic server usage" to tell Next.js that a
  page is dynamic. Without `setRethrow`, the SDK caught it, and the build
  failed.
- Code generation: `withFlags({})` returns a function of the phase, by
  default. `nextConfig` can also be a function of the phase. It generates the modules one time for
  `phase-production-build`, and watches the flags files for
  `phase-development-server` (see "Code generation"). The workers of
  Next.js load the configuration again, but only one process generates.
- Not done yet: `onInit` and `onShutdown` (Next.js has no hooks for them,
  except `register` in `instrumentation.ts`), the proxy (`proxy.ts`), which
  gets the full `NextRequest`, and server actions.

`tests/standard/next` tests the binding with a build of Turbopack.
`pnpm test:e2e` runs the tests with HTTP requests, without a browser. `next dev` was also
tested by hand, with a change of the configuration during the run.

**SvelteKit** (done). Package: `@flags-sdk/sveltekit`. Guide:
`../framework-sveltekit/README.md`.

- `flags()` of `@flags-sdk/sveltekit/vite` uses `@flags-sdk/vite` with the
  binding `@flags-sdk/sveltekit/binding`. The plugin resolves the binding
  from the project, points `flags/hooks` and
  `flags/settings` to the files of the application, and bundles
  `flags` and `@flags-sdk/sveltekit` into the server code
  (`ssr.noExternal`), so that the aliases reach the SDK.
- The request: `getRequestEvent()` of `$app/server` (SvelteKit 2.20 or
  newer), with the headers and the URL of the request. The application
  needs no `handle` hook. Outside of a request, there is no request.
- The rethrow: `isRedirect()` and `isHttpError()` of `@sveltejs/kit`. The
  plugin deduplicates `@sveltejs/kit` (`resolve.dedupe`), so that the
  binding and the application use one copy, and `isRedirect()` recognizes
  the `redirect()` of the application.
- Code generation: `flags()`, by default (see "Code generation"). The
  folder is `src/flags`, since SvelteKit type-checks `src` only.

**Nuxt (Nitro)** (done). Package: `@flags-sdk/nuxt`. Guide:
`../framework-nuxt/README.md`.

- The module `@flags-sdk/nuxt` sets the aliases in `nitro.alias`, adds
  `flags` and `@flags-sdk/nuxt` to `externals.inline`, and sets
  `experimental.asyncContext`. It points Nitro to the ESM files of the
  package, so that the bundle has one copy of the SDK.
- The binding `@flags-sdk/nuxt/binding` gets the request with `useEvent()`
  of `#imports`, which needs the async context of Nitro. The module sets
  it, so the application does not opt in.
- The rethrow: `isError()` of h3, through `#imports`. An application of
  Nuxt depends on `nuxt`, not on `h3` or `nitropack`, so the binding
  imports the auto-imports of Nitro.
- In development, Nitro loads `flags` from `node_modules`, so the alias does
  not reach the SDK. The Nitro plugin (`@flags-sdk/nuxt/plugin`) therefore
  registers the binding with `registerFramework` of `flags/tooling`. Nitro
  always bundles its plugins.
- The plugin also calls `runtime.onInit` at the start, and
  `runtime.onShutdown` in the hook `close`.
- Code generation: `modules: ['@flags-sdk/nuxt']`, by default. The module
  sets the aliases `flags:<source>` for Vite and for Nitro, and adds
  `flags/generated.d.ts` to the types of Nuxt (see "Code generation").

**Hono** (done). Package: `@flags-sdk/hono`. README: `../framework-hono/README.md`.

- `flags({ config })` is a middleware: each request runs in
  `runtime.onInvoke` with `c.req.raw`. Hono often runs without a bundler,
  so the configuration is an option, not an alias.
- The rethrow: `instanceof HTTPException` of `hono/http-exception`.

**Express** (done). Package: `@flags-sdk/express`. Guide:
`../framework-express/README.md`.

- `flags({ config })` is a middleware. It converts the Node.js headers into
  Web `Headers`, and builds the URL from the `Host` header and
  `originalUrl` (`toFlagsRequest`).
- The handlers which `next` calls run in the scope of the request, also
  after an `await`.

**TanStack Start** (done). Package: `@flags-sdk/tanstack-start`. Guide:
`../framework-tanstack-start/README.md`.

- `flags()` of `@flags-sdk/tanstack-start/vite` uses `@flags-sdk/vite`
  with the binding `@flags-sdk/tanstack-start/binding`.
- The request: `getRequest()` of TanStack Start, in server functions,
  server routes and the rendering of pages.
- The rethrow: `isRedirect()` and `isNotFound()` of TanStack Router.
- TanStack Start has a package for React and one for Solid. Thus, the
  binding imports `flags:tanstack-start/server` and
  `flags:tanstack-start/router`, which the plugin resolves to the packages
  of the project (`projectModules`).
- The plugin excludes `flags` and the package from the optimizer of
  dependencies: the optimizer would bundle the server module of TanStack
  Start in advance, which only works inside TanStack Start.
- The manifest goes into `.output/server` (the build of Nitro). The SSR
  environment of Vite runs in a worker of Nitro and is not runnable, so the
  dev endpoint uses a runnable copy of it (`createRunnableDevEnvironment`).
- Code generation: `flags()`, by default, as for SvelteKit.

**Astro**

- Its integrations can change the configuration of the bundler, and it has
  a request context for a source. Not examined yet.

### Registration

The functions are exports of `flags/runtime`.

- `registerSources(sources)` registers sources. Use it when you
  have the sources.
- `registerFlags(moduleExports)` registers the sources of all flags that a
  module exports. Use it with a module that only exports flags. It throws if
  an export is not a flag, and then registers nothing.
- `source.bindFlag` registers the source of the flag. Thus, you only need these
  functions for flags that are defined after `onInit`, e.g. in modules that are
  imported lazily, or for plain flag objects.
- The framework plugins call `registerFlags` for each `'use flags'` module
  (see "Discovery").

## Flag values in the page

A page can contain the values of its flags, for Flags Explorer and for the
analytics of Vercel. The format is section 11 of `STANDARD.md`: the element
`<script type="application/json" data-flag-values>`, as in v4.

- `flags/explorer` has the standard: `encryptFlagValues`, `decryptFlagValues` (only
  for `FLAGS_SECRET`) and `serializeFlagValues`. The type is
  `FlagValuesType`, as in v4, so that it does not conflict with the
  component `FlagValues`.
- The framework packages have the components, e.g. `<FlagValues>` of
  `@flags-sdk/next`, because a component belongs to the framework.
- The default encryption:
  - with `FLAGS_SECRET`: the format of v4 (`dir`, `pur: 'values'`, `v`), so
    that the current Vercel Toolbar can read it;
  - without it: `ECDH-ES` with `A256GCM` and the public key of Vercel. The
    browser sends the token to Vercel, and the intake decrypts it with the
    private key.
- Plain values only if the application selects them, because each visitor
  can read them.
- Why `ECDH-ES` with P-256: Web Crypto supports it in each runtime, the keys
  are small, and the token has no encrypted key. `RSA-OAEP` would give
  larger keys and tokens.
- The public keys are a JWK Set. The SDK loads it on the first use, keeps it
  for 5 minutes, and shares one request between concurrent calls. After an
  error, it throws the same error for 30 seconds, so that a missing key set
  does not cause one request for each page. The key ID (`kid`) in the header
  lets the platform rotate its keys.
- The protected header has the key ID and the project IDs which may use the
  token. By default, the SDK uses the ID of the Vercel project. An application
  can give up to 100 distinct project IDs, e.g. for microfrontends. The intake
  checks its authorized project before decrypting. The payload has the
  audience, purpose, version and values; it has no project scope.
- No authenticity: each visitor can encrypt other values with the public
  key. This is acceptable for analytics, as for each data from the client.
  The intake must not trust the values for other purposes.
- Vercel publishes the key set at
  `https://keys.vercel-flags.com/.well-known/jwks.json`.
- `FlagValues` of `@flags-sdk/next/flag-values` is a server component with
  its own `<Suspense>`. It must not make a page dynamic: a precomputed page
  has values which the proxy selected, and it must stay fully static.
  - The encryption uses random values (the ephemeral key and the IV) and
    the time (`iat`). Next.js allows them in a prerender of Cache Components
    only in a cache scope. The values of a static page are the same for each
    visitor, so one token for them is correct.
  - Thus, with Cache Components, the component encrypts in `'use cache'`,
    with `cacheLife('max')`. The token goes into the static HTML. With
    `flags`, the evaluation is dynamic anyway, and the cache gives one token
    for each set of values.
  - Without Cache Components, `'use cache'` is an error of the build, and a
    prerender allows random values, so the component encrypts without a
    cache.
  - `withFlags` selects the module: it points the alias
    `@flags-sdk/next/encrypt-values` to `@flags-sdk/next/encrypt-values-cached`
    only with Cache Components.
  - The options of the encryption must be serializable, so `FlagValues` has
    no `fetch` option.
- `reportValue` is a different mechanism: it reports values on the server,
  through `@vercel/request-context`. `@vercel/flags-core` already reports
  each evaluation of `VercelProvider` in this way.

## Flags files

A flags file declares the flags of an application in a file of its own,
with the extension `.flags`. By convention, the main file is `app.flags` in
the root of the application. The application imports its flags from the
file:

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
```

The flags files are the flags of the application. The application is the
source of truth of which flags exist and what the code knows about each
flag (key, type, options, description, default value). The flag
management system stays the source of truth of the values: the rules, the
rollouts and the targeting. Thus:

- A branch which adds a flag shows it in its diff, and only its own flags.
- The build and the type check use no network and no credentials. They
  work offline, in CI and in a sandbox, also for an agent which can not
  create flags in the system.
- An agent sees each flag, its type and its options in the repository.
- A flag works before it exists in the system: the provider returns
  `FLAG_NOT_FOUND`, and the flag returns its `defaultValue`.

The flags files are the only declarations of the flags for the code
generation. There are no catalogs of the flag management system (see
"Code generation").

### The format

A flags file has its own small syntax, for JavaScript and TypeScript
developers: two statements, and a body which is JSON5, with new lines as
separators. It is encoded in UTF-8.

```txt
file      = (comment | source | flag)*
source    = "source" source-name
flag      = "flag" identifier [object]
source-name = identifier ("-" identifier)* | string
object    = "{" [pair (separator pair)* [","]] "}"
array     = "[" [value (separator value)* [","]] "]"
separator = "," | a new line
```

- `source <name>`: the default source of the flags of the file,
  `[a-z][a-z0-9_-]*` (case-insensitive), e.g. `source self` or
  `source my-source`. A name with another character needs quotes. At most
  one, before the first flag. The default is `self`.
- `flag <name>`: one flag. The name is a JavaScript identifier, and not a
  reserved word: it is the name of the export, which the application
  imports (see "The name and the key"). `flag summer-sale` and
  `flag "summer-sale"` are errors, with a hint which shows the field
  `key`.
- The body `{ … }` is optional. It is an object of JSON5: JSON, plus keys
  without quotes, strings in single quotes, trailing commas, hexadecimal
  numbers, a leading `+`, `.5` and `5.`, and the escapes of JSON5. A
  backslash at the end of a line continues a string. `Infinity` and `NaN`
  are errors, because they have no JSON value.
- A new line separates two entries of an object or two items of an array,
  as a comma does. Commas are optional at the end of a line, and two
  entries on one line need a comma. Thus each valid JSON5 body is also a
  valid body, but not each body is JSON5.
- Comments are `//` and `/* … */`, everywhere between tokens. `#` is an
  error, with a hint.
- Only plain values: strings, numbers, `true`, `false`, `null`, arrays
  and objects. References, function calls, operators, template literals,
  computed keys and `undefined` are errors. Nothing is evaluated.
- The fields of a flag are `key`, `source`, and the options of
  `bindFlag`:

  | Field | Value |
  | --- | --- |
  | `key` | The key of the flag in the flag management system, a string. The default is the name |
  | `source` | The source of this flag, a string, e.g. `source: "marketing"`. The default is the source of the file |
  | `description` | A string |
  | `type` | `"boolean"`, `"string"`, `"number"` or `"object"` |
  | `defaultValue` | A value of the type. Without it, a failed evaluation throws |
  | `options` | An array of values, or of `{ value: …, label: "…" }`. An option of an `object` flag must be `{ value: … }` |

- The type is `type`, else the type of `defaultValue`, else the type of
  the options, else `boolean`, as for `bindFlag`. Thus `flag newFeature`
  is a boolean flag. A value of the type `object` is an object, an array
  or `null`.
- An error: a statement other than `source` and `flag` (e.g. `resource`),
  two `source` statements, `source` after a flag, a name which is not an
  identifier or which is a reserved word, an unknown field (with "Did you
  mean …?"), a value of the wrong type, an empty `key`, options of
  different types without `type`, an option two times, a name two times,
  two flags with the same key and the same source, a key of an object two
  times, and an integer which is not a safe integer of JavaScript. A warning: a `defaultValue` which is not one of the options.
- Each diagnostic has a stable number (`DiagnosticCode`), and the offset
  and the length of its text in the file.

Why not an existing language: TOML needs `["a.b"]` for such a key and has
no `null`. HCL uses `=` and has rules for blocks on one line which
JavaScript developers do not expect. YAML turns `no` and `off` into
booleans, which is wrong for the values of flags. TypeScript does not let
a content mapper take `.flags.json`, because `.json` is a built-in
extension. The body is JSON5 with new lines as separators, so a parser of
another language is a small parser of JSON5 plus the two statements.

### The name and the key

A flag has a name and a key:

- The name, after `flag`, is the name of the export: the application
  imports it, e.g. `import { summerSale } from './app.flags'`. It is a name
  of the code, as the name of a variable.
- The key, in the field `key`, is the key of the flag in the flag
  management system, e.g. `summer-sale`. It is what the provider gets, and
  what the manifest and Flags Explorer show. Without `key`, the key is the
  name.

```js
flag summerSale {
  key: "summer-sale"
}
```

The SDK never makes one from the other. Thus a key can have any
characters, and the name in the code can change while the flag keeps its
key.

### The source of a flag

The source of a flag is its field `source`, or else the source of its
file. A file can thus have a flag of another source, for one case:

```js
source self

flag summerSale

flag heroText {
  key: "hero-text"
  source: "marketing"
}
```

A key can be in one file once for each source: two flags with the same
key and different sources are two flags.

### Imports by source

An application can also import a flag from its source, `flags:<source>`,
which has the flags of that source from all flags files (see "The source
of a flag"):

```ts
import { checkout, summerSale } from 'flags:self';
// The same flag as
import { summerSale } from './app.flags';
```

- `writeFlagsFileSources(directory)` of `flags/tooling` writes one module
  for each source of the flags, `.flags/<source>.ts`. It re-exports the
  flags of the source from each file, with their names:
  `export { checkout, summerSale } from '../app.flags';`. It has no
  `'use flags'`: the files register their flags, and the manifest names
  the files as the declarations.
- It writes `.flags/aliases.json` for the framework plugins, and removes
  the module of a source which no file has any more.
- A flags file without flags is valid, and defines its source: an empty
  `app.flags` gives `flags:self`, with no exports, e.g. before the first
  flag of a new application. Without a flags file of a source, there is no
  `flags:<source>`: the bundler can not resolve an import of it, and the
  type check fails.
- It writes `flags/generated.d.ts` (see "Where the types go" of "Code
  generation"), with one `declare module 'flags:<source>'` for
  each source. The type of each flag is the type of its export in its
  file, `(typeof import('../app.flags'))['summerSale']`, with the JSDoc of
  the flag. Thus it works with the content mapper and with the declaration
  files of each flags file.
- A key or a name in two files of one source is a conflict: the second
  flag is not in `flags:<source>`. `flags sync` and a build fail with it,
  e.g. `flags: The key "checkout" of the source "self" is declared in
  app.flags and in checkout/checkout.flags. Declare it in one file.` The
  dev servers report it, and go on.
- `generateFlags` and `watchFlags` call it for an application with flags
  files, and return its aliases, so the plugins of Next.js and Vite point
  `flags:<source>` to the modules. The dev servers write the modules again
  after each change of a flags file. A new source needs a restart, as its
  alias is new.

### The source

A source is the folder `flags/sources/<source>` of the
application (in its root or in `src`):

| File | Default export |
| --- | --- |
| `provider.ts` | The OpenFeature provider |
| `context.ts` (optional) | `getEvaluationContext(request, input)` |
| `hooks.ts` (optional) | The OpenFeature hooks of the source |

The files can also be `.mts`, `.tsx`, `.js` or `.mjs`. The source `self`
of an application which depends on `@vercel/flags-core` needs no
`provider.ts`: its provider is `new VercelProvider()`, and its project
`{ system: 'vercel-flags' }`. `"selfSource": false` in `flags/config.json`
turns this off. Without a provider, the compilation throws, e.g.
`The source "shop" needs flags/sources/shop/provider.ts.`

The application directory is the nearest directory with a `package.json`,
or the directory which the framework plugin gives.

### The module

`compileFlagsFile(text, { fileName })` of `flags/tooling` compiles a flags
file into a module. It is the code that an application can write by hand:

- the `'use flags'` directive;
- the imports of `provider.ts`, `context.ts` and `hooks.ts`, relative to
  the flags file, with their extension;
- one `defineSource` for each source of the flags of the file, in the
  order of the file (`source_0`, `source_1`, …), with the `project` of the
  default source `self`;
- `export const <name> = source_<n>.bindFlag(key, { type, options,
  description, defaultValue })` for each flag, in the order of the file,
  with a JSDoc of its description, its options, its default value, and
  its key and its source if they are not the defaults;
- the self-registration (`registerFlags` of `flags/runtime`), unless
  `selfRegistration: false`.

Each flags file has its own `defineSource` for each source. Two files with the same source
share its provider and its `getEvaluationContext` (the steps of the
context chain are cached by function, see "Cache"), and each
`new VercelProvider()` without arguments uses the same client.

The compilation throws a `FlagsFileError` with each error, e.g.:

```txt
app.flags:6:17 - error: A flags file has only plain values: strings, numbers, true, false, null, arrays and objects. Put text in quotes: "tru".

    defaultValue: tru,
                  ~~~
```

A flags file is a flags module of "Discovery": `findFlagsModules` returns
it, and the manifest has its flags, with the declaration
`{ module: 'app.flags', export: 'summerSale' }`.

### In the frameworks

| Setup | What compiles the flags files |
| --- | --- |
| Next.js, `withFlags` | A Turbopack rule `*.flags` with the loader `@flags-sdk/next/flags-file-loader` (`as: '*.js'`). The rule of `'use flags'` skips flags files |
| Vite, SvelteKit, Nuxt, TanStack Start | The `transform` of the plugin `flags` |
| Node.js without a bundler, e.g. Hono, Express | `node --import flags/register server.ts` (`module.registerHooks`, Node.js 22.15 or newer). It also lets relative imports leave out `.ts` |

The loaders watch the folders of the sources, so a new `context.ts`
changes the module.

### TypeScript

`renderFlagsFileTypes(text, { fileName })` gives the types of a flags
file: one declaration for each flag, with the type which `bindFlag` gives
to hand-written code (`Flag<Source, key, Input, FlagValueFrom<type, options>>`),
the input of `context.ts`, and the same JSDoc. It never throws: a flag
with an error is left out, and the diagnostics say why.

There are two ways, and an application can have both:

- **Declaration files** (each TypeScript version): a declaration file next
  to each flags file, e.g. `app.d.flags.ts` for `app.flags`, with
  `allowArbitraryExtensions` in `tsconfig.json`. The framework loaders and
  `flags/register` write it when they compile the file
  (`writeFlagsFileDeclaration` of `flags/tooling`), `flags sync` writes it
  for each flags file, and `flags watch` and the dev servers write it
  after each change. The SDK removes a declaration file with its own
  header when its flags file is gone. Applications ignore `*.d.flags.ts`
  in Git. Without a dev server (e.g. plain Node.js), a changed flags file
  has new types after the next start, `flags watch` or `flags sync`.
- **The content mapper** (TypeScript 7.1 and newer, optional): the
  application adds it to `tsconfig.json`, and runs
  `tsc --runExternalCode`. TypeScript then reads the flags files itself,
  and the editor goes from an import to the flag in the flags file.

  ```json
  {
    "contentMappers": [{ "package": "flags", "extensions": [".flags"] }]
  }
  ```

  The `package.json` of `flags` has `typescript.contentMapper` with
  `exec: ["node", "bin/content-mapper.js"]` and `dynamicConfig: true`. The
  process speaks the JSON-RPC protocol of the content mappers (LSP
  framing). Its `configIdentity` is a hash of the `package.json`, of
  `flags/config.json` and of the files of the sources which exist, and it
  watches them. Each export and each local declaration maps to the key of
  its flag (`Alias`, with hover, definition, type definition, references
  and highlights, but no rename: a new key is a new flag). The errors of
  the file are diagnostics of the file. The warnings are not, because
  `tsc` fails on each diagnostic.

The SDK writes the declaration files also when `tsconfig.json` has the
content mapper. Most editors run an older TypeScript (e.g. `vtsls` of
Zed, or the TypeScript of VS Code without the extension of TypeScript 7),
which reads the declaration files and ignores `contentMappers`.
TypeScript 7.1 with `--runExternalCode` takes the content mapper over the
declaration file: go to definition goes to the flags file. TypeScript 7.1
without `--runExternalCode` takes the types from the declaration file, but
fails on `contentMappers` (TS18068).

### Editors

- `packages/vscode-flags` is a VS Code extension: the language `flags`, a
  TextMate grammar (`source.flags`), snippets, and the registration of the
  content mapper with the extension of TypeScript 7.
- The grammar marks `source` and `flag` (`keyword.other`), the key of each
  flag (`entity.name.function`), the fields (`keyword.other.field`) and the
  type (`support.type.primitive`). It marks as `invalid.illegal` what a
  flags file does not allow: an unknown field, a key with `.` without
  quotes, `#` comments, other statements, and expressions. Shiki can load
  it.
- `packages/tree-sitter-flags` is the Tree-sitter grammar, for Zed,
  Neovim, Helix and other editors with Tree-sitter. It has the generated
  parser (ABI 14, `pnpm --filter tree-sitter-flags generate`), queries for
  highlights, folds and indents with the capture names of nvim-treesitter,
  and tests (`pnpm --filter tree-sitter-flags test`), also of the
  highlights. It accepts a little more than the SDK, e.g. two entries on
  one line without a comma: the parser of the SDK is the reference. No two
  patterns of the queries capture the same node, because editors do not
  agree which capture wins.
- `packages/zed-flags` is the extension of Zed: the language, highlights
  with the capture names of Zed, brackets, indents, and the flags in the
  outline. Zed builds the grammar from a commit (`rev` in
  `extension.toml`, with `path = "packages/tree-sitter-flags"`).
  `scripts/dev.mjs` prepares a dev extension with a local copy of the
  grammar, before such a commit exists.
- `formatFlagsFile(text, { fileName })` of `flags/tooling` formats a
  flags file, and `flags format [paths...] [--check]` formats the files,
  and the flags files of the folders (the default is the current
  directory). `--check` writes nothing and fails if a file changes.
  `flags format --stdin [--stdin-filepath <file>]` formats the standard
  input to the standard output, for editors: Zed uses it as an external
  formatter (`"formatter": { "external": … }` of the language `Flags`),
  because an extension of Zed can not give a formatter without a language
  server. The format:
  - Two spaces. One entry on each line of an object or an array on many
    lines, with new lines and without commas, as the examples of "The
    format" show.
  - An object or an array stays on one line if it was on one line, has no
    comments, and fits into 80 columns, e.g.
    `options: ["control", { value: "express", label: "Express" }]`, with
    `, ` and spaces inside `{ }`. A new line after `{` or `[` keeps it on
    many lines, as Prettier does with objects. This is also the rule of
    the body of a flag: `flag a { defaultValue: true }` stays.
  - Strings in double quotes, unless the string has more double quotes
    than single quotes. The other escapes and the numbers stay as they
    are. A key in quotes which is a simple name (`[A-Za-z_$][A-Za-z0-9_$]*`)
    loses its quotes.
  - One space between the parts of a statement. A blank line after
    `source` and around a statement with more than one line. Other blank
    lines stay, at most one.
  - The comments stay. A comment at the end of a line stays there, also
    after a comma. A comment between the parts of an entry or of a
    statement, e.g. `key /* c */: "a"`, moves to its own line before it.
    The lines of a `/** … */` comment get the indentation of its place.
  - `\n` line endings, a new line at the end, and the byte order mark if
    the file has one. An empty file stays empty.
  - Only the syntax: a file with a syntax error throws a `FlagsFileError`
    (`flags format` shows it, and writes nothing), while a file with other
    errors, e.g. an unknown field, is formatted. The formatted file has
    the same statements and values as the file.
- GitHub does not know the language. `*.flags linguist-language=JSON5` in
  `.gitattributes` highlights the strings, the keys and the comments. A
  language of Linguist needs more use first.

### Open

- `flags check`: compare the flags files with the system, e.g. in CI: the
  flags of the code which the system does not have, the flags of the
  system which no file declares, and different types or options.
- `flags import` (or `vercel flags pull`): write or update a flags file
  from the flags of a system, for applications with flags in a system
  already. It replaces the automatic download of the removed catalogs
  with an explicit command, whose result is committed.
- The platform creates the flags of the manifest in the system after a
  deployment, so that an agent without access to the system can add a
  flag.
- The project of a source other than `self`, e.g. a `project.json` in the
  folder of the source, for the links of Flags Explorer.
- A language server for flags files, for the editors without TypeScript
  7.1: diagnostics, completion of the fields, and hover. The Zed extension
  can start it.
- Publish the Zed extension, and set `rev` in `extension.toml` (it is a
  placeholder now).
- `node_modules/.bin/tsc` of TypeScript 7.1 beta replaces itself with the
  native `tsc` through `process.execve(exe, args)`, without `env`. On
  Node.js 22 (e.g. 22.19), this passes an empty environment, so
  `exec: ["node", …]` does not find `node` (`executable file not found in
  $PATH`). Node.js 24 passes `process.env`, and the native `tsc` works on
  each version. Report it to TypeScript (pass `process.env`).

## Code generation

The code generation writes the modules of `flags:<source>` and the types of
the flags files (see "Imports by source" and "TypeScript" of "Flags
files"). It reads only the flags files, so it uses no network and no
credentials, and each build gives the same result.

Earlier drafts generated the modules from catalogs of the flag management
system: `flags/sources/<source>/catalog.ts` with a `CatalogLoader`, and
`@vercel/flags-core/catalog` for the default source `self`, which put each
flag of the Vercel project into `flags:self` without a declaration. They
are removed. The flags files replace them: each flag of the code is
declared in the repository, and a branch shows its own flags.

### Where the types go

`flags/generated.d.ts` declares the modules `flags:<source>`. The default
`include` of TypeScript (`**/*.ts`) finds it, so the application needs no
`paths`.

- It goes into the folder `flags` which exists, in the root of the
  application or in `src` (e.g. with `flags/sources` or `flags/hooks.ts`).
  Without one, it goes to `src/flags/generated.d.ts` if the application has
  `src`, else to `flags/generated.d.ts`, and the generation creates the
  folder.
- It removes a `generated.d.ts` with its own header from the other place,
  so that one file declares the modules. A file which the SDK did not
  write stays. `findGeneratedDeclarations(directory)` finds the file.
- The application can commit the file, so a type check works before the
  first build, or ignore it and run `flags sync` before `tsc`.
- Without flags files, the generation writes nothing. If `.flags` exists
  from an earlier run, it removes the old modules.

### The commands

- `flags sync [dir]` writes the modules and the types one time. A key or a
  name in two files of one source fails it.
- `flags watch [dir] [-- command ...args]` writes them again after each
  change of a flags file. It starts the command after the first write, and
  stops when the command ends, or on SIGINT and SIGTERM. A new source needs
  a restart.

### In the frameworks

Each framework with a bundler runs the code generation by default, and has
the option `disableCodeGeneration` to turn it off. Its build plugin writes
the modules one time for a build, and again after each change of a flags
file in development. It adds the aliases `flags:<source>` to the bundler.
The loaders compile the flags files in each case (see "In the frameworks"
of "Flags files").

| Framework | Setup | Opt-out |
| --- | --- | --- |
| Next.js | `withFlags({})` of `@flags-sdk/next/plugin` | `withFlags({}, { disableCodeGeneration: true })` |
| SvelteKit | `flags()` of `@flags-sdk/sveltekit/vite` | `flags({ disableCodeGeneration: true })` |
| TanStack Start | `flags()` of `@flags-sdk/tanstack-start/vite` | `flags({ disableCodeGeneration: true })` |
| Nuxt | `modules: ['@flags-sdk/nuxt']` | `modules: [['@flags-sdk/nuxt', { disableCodeGeneration: true }]]` |
| Other Vite frameworks | `flags()` of `@flags-sdk/vite` | `flags({ disableCodeGeneration: true })` |

- Next.js: by default, `withFlags` returns a function of the phase. It
  writes for `next build`, and watches for `next dev`. The configuration
  can also be a function of the phase: `withFlags((phase) => ({ ... }))`.
  With `disableCodeGeneration`, `withFlags` returns a configuration object
  as it is, and still reads the aliases of `.flags/aliases.json`, e.g.
  after `flags sync`.
- Vite: the plugin writes in its `config` hook, before Vite resolves the
  imports. It watches for `vite dev`, and writes one time for `vite build`.
  Under Vitest (`process.env.VITEST`), it writes one time too: Vitest runs
  the plugin with `serve`, but has no HTTP server whose close would end the
  watch, so `vitest run` would not exit.
- Nuxt: the module writes before the build, gives the aliases to Vite and
  to Nitro, and adds `flags/generated.d.ts` to the types of Nuxt with the
  hook `prepare:types` (found with `findGeneratedDeclarations`).
- A process writes one time for each directory, also when the framework
  loads the configuration more than once.

Hono, Express and plain Node.js have no bundler, so they have no plugin.
`node --import flags/register` compiles the flags files, and the
application imports its flags from the files.

## Discovery

Discovery is optional, on top of the rest: everything else works without
it. It gives tools such as Flags Explorer the flags of an application, as a
manifest. The framework collects the data and emits the manifest, through
the framework plugins of the SDK. There is no secret, no access check, and
no public endpoint in production.

### `'use flags'`

A module which starts with the `'use flags'` directive is a flags module:

- Each export is a flag: an object or a function with a string `key`, e.g.
  a flag of `defineFlag`. The contract is based on the exported objects,
  not on `defineFlag`.
- Importing it has no side effects, e.g. no network connections. Tools
  import it to read its exports. OpenFeature providers usually connect in
  `initialize`, not in the constructor, so `defineSource` in such a
  module is fine.
- The directive is found in the directive prologue (comments, whitespace,
  and string literals at the start), as for `'use client'`. It is not a
  parser.
- The framework plugins append a self-registration to each flags module:
  `import { registerFlags } from 'flags/runtime'; import * as self from './flags'; registerFlags(self);`. `registerFlags`
  registers the sources of the exports, also of plain flag objects. Without
  a plugin, call `registerFlags` by hand.

### The manifest

`createManifest(modules)` (export `flags/manifest`) creates the manifest
from the exports of the flags modules. It evaluates nothing.

```json
{
  "version": 1,
  "definitions": {
    "bannerText": {
      "type": "string",
      "options": [{ "value": "Welcome" }, { "value": "Summer sale!" }],
      "defaultValue": "Welcome",
      "description": "The text of the banner",
      "declaredInCode": true,
      "declarations": [{ "module": "src/lib/flags.ts", "export": "bannerText" }]
    }
  }
}
```

- The fields have the names of the definitions of Flags Explorer
  (`options`, `defaultValue`, `description`, `declaredInCode`), plus `type`,
  `source` and `declarations`. The links come from the source (see
  "Links to the dashboard").
- `source.bindFlag` and `defineFlag` have an optional `description` for it.
- An export which is not a flag throws. Two exports with the same key must
  declare the same flag; then the flag has two declarations.
- The keys are sorted, so the file is stable.

### Links to the dashboard

The links to the dashboard of a system (the `origin` of v4) are not in
the manifest. The manifest has only the variables. A tool builds the links
when it shows a flag. Thus, a system can change its links without a new
build of the application.

1. Each source is in `sources` of the manifest: its system, the
   URL of its system manifest, and the variables of its project (the
   fields of `project`, without `system` and `systemManifest`). The
   definitions refer to it by an id: the system, and a number if two
   sources have the same system. Two source objects with the same
   project are one source. The Next.js route loads the configuration
   first (`runtime.prepare()`).
2. Vercel Flags uses the platform project of Vercel as its flag project.
   Thus, its variables `projectId`, `environment` and `teamId` come from
   the environment of the build, like the platform project of the
   overrides (`findPlatformProject`). The fields `projectId` and `teamId`
   of the source override them, for the flags of a different project.
3. The system publishes a system manifest: JSON, with the schema
   `https://flags-sdk.dev/schemas/system-manifest.v1.json`. It has the
   name, a logo, the variables, and the URL templates `flag`, `createFlag`
   and `project`.
4. A tool fetches the system manifest, with HTTP caching, and calls
   `resolveFlagLinks(systemManifest, variables, flagKey)` of
   `flags/manifest`. The SDK itself fetches nothing.

```json
{
  "$schema": "https://flags-sdk.dev/schemas/system-manifest.v1.json",
  "version": 1,
  "name": "LaunchDarkly",
  "variables": {
    "projectId": { "description": "The key of the project" },
    "environment": { "description": "The key of the environment" }
  },
  "links": {
    "flag": "https://app.launchdarkly.com/{projectId}/{environment}/features/{flagKey}/targeting"
  }
}
```

- The templates use level 1 of RFC 6570: `{name}` placeholders, replaced
  with URL-encoded values. `flagKey` is always a variable of the link of a
  flag.
- Only HTTPS. A placeholder must not be in the origin, so a value can not
  send the user to a different site. No credentials and no fragment.
- A link whose variables are not all known is left out: no broken links.
- The URL of the system manifest comes from the list of the SDK
  (`systemManifestUrls`, next to `ProjectFieldsBySystem`). A project
  can give its own URL in `project.systemManifest`, an HTTPS URL.
- A new system adds itself with a pull request: its fields in
  `ProjectFieldsBySystem`, and its URL in `systemManifestUrls`.
- The hosted files: for Vercel Flags, the link of a flag
  `https://vercel.com/{teamId}/{projectId}/flag/{flagKey}` and the link
  `createFlag` `https://vercel.com/{teamId}/{projectId}/flags?create=1`
  (the dashboard accepts the IDs of the team and of the project). For
  LaunchDarkly, only the link of a flag of v4,
  `https://app.launchdarkly.com/{projectId}/{environment}/features/{flagKey}/targeting`.
  A LaunchDarkly project without `environment` has no link.
- Until a system publishes its own file, the SDK hosts it in `apps/docs`
  (`public/system-manifests/<system>.json`), at
  `https://flags-sdk.dev/system-manifests/<system>.json`. When the
  system publishes its file, the hosted file can redirect to it, so the
  URL in the SDK does not change.

### Where the manifest is

| Framework | Plugin | Development | Build |
| --- | --- | --- | --- |
| Next.js | `withFlags` and the route `export { GET } from '@flags-sdk/next/manifest'` | the route | `flags-manifest.json` in `distDir` |
| SvelteKit | `flags()` of `@flags-sdk/vite` | `/.well-known/flags/manifest.json` | `flags-manifest.json` in the server output |
| Nuxt | `modules: ['@flags-sdk/nuxt']` | `/.well-known/flags/manifest.json` | `flags-manifest.json` in `.output/server` |
| No bundler, e.g. Hono | none | none | `flags manifest [dir]` after the build |

- The plugins find the flags modules with a scan of the files of the
  project (`findFlagsModules`): the directive prologue of each source file,
  without `node_modules`, the output of builds, and hidden directories. The
  bundler of the framework then compiles and imports them, so path aliases
  and TypeScript work. The scan finds all flags modules, also of routes
  which are not open.
- Development: the endpoint imports the modules on each request, and
  answers with `cache-control: no-store`. In production, there is no
  endpoint.
- Build: each flags module becomes its own chunk with all its exports
  (Vite, Rollup, Nitro), or the compiled route of the manifest is called
  (Next.js). A child process imports them after the build and writes the
  file, so the modules do not run in the process of the build.
- A platform puts the file into its build output, e.g. in
  `onBuildComplete` of the Adapter API of Next.js. Where the Build Output
  API of Vercel expects it is open.
- `flags manifest [dir] [--out <file>]` imports the flags modules of `dir`
  with Node.js. It works on the source if Node.js can run it (TypeScript
  with type stripping in Node.js 22.18 or newer), or on the output of a
  build which keeps the directive, e.g. `tsc`. A bundled output loses the
  directive.

### Next.js details

- The loader `@flags-sdk/next/use-flags-loader` adds the self-registration, with
  a rule of Turbopack with a condition on the content.
- The loader `@flags-sdk/next/manifest-loader` puts an import of each flags
  module into `@flags-sdk/next/manifest`, so that Next.js compiles them. It adds
  the project as a context dependency (`addContextDependency`), so the
  bundler runs it again when a file changes, e.g. a new flags module in
  `next dev`. Tested with Turbopack, without a loop of rebuilds.
- A plugin can not add a route, so the application has one route file:
  `app/.well-known/flags/manifest.json/route.ts`. Without it, there is no
  manifest.
- `compiler.runAfterProductionCompile` (since Next.js 15.4) calls the
  compiled route (`routeModule.userland.GET`) in a child process. This uses
  the layout of the build output of Next.js, which `tests/standard/next`
  tests.

### Turbopack collect/emit

Next.js 16.4 has the compiler intrinsics `__turbopack_emit__` and
`__turbopack_collect__`: a loader marks a module, and a collector gets the
marked modules of the app graph. They could replace the scan and the
manifest loader for Turbopack. They are not used yet: they are not
documented, they only exist with Turbopack and Next.js 16.4 or newer, and
in development they only find the modules of the current route. The team
of Turbopack works on a collection of the whole application.

## Next steps

### The Vercel platform

- **Flags Explorer.** It reads the flags manifest of v5 in development at
  `/.well-known/flags/manifest.json`, and writes the override cookies of
  section 10 of `STANDARD.md`. Open:
  - The manifest of a deployment, from the build output (see "The build
    output"). Until then, Flags Explorer shows the flags of a deployment
    only from the page and from the flags of the deployment of v4.
  - The links to the dashboard from the system manifests
    (`resolveFlagLinks`). Flags Explorer builds them only for Vercel Flags
    now, from the `projectId` of the source. The system manifests on
    flags-sdk.dev do not exist yet (404). The toolbar should load them
    through vercel.live, not from the page, with the checks of section 9.2.
- **A default for `flags/sources/self`.** Done for Vercel Flags, on the
  level of the files: the default source `self` of `@vercel/flags-core`
  (see "The source" of "Flags files"). The runtime still has no default
  source (see "No default source"). The OFREP endpoint of Vercel Flags and
  the replacement of `flags/default-provider` are not planned in their
  earlier form.
- **KMS for flag overrides.** Flags Explorer signs override tokens with Vercel
  KMS (`flag-overrides`), with the claims of section 10.2 of
  `STANDARD.md`. The official issuer exists, and the SDK uses it
  (`VERCEL_TOOLBAR_ISSUER`).
- **The overrides from end to end** with the real Vercel Toolbar, in a test.
- **Flag values.** The intake decrypts the tokens of section 11.3 of
  `STANDARD.md` with the private key. Flags Explorer reads the elements of
  the page, and sends the tokens to Vercel. Vercel publishes its key set,
  and the SDK uses its URL (see "Before publishing").
- **`FlagValues` for the other frameworks.** `@flags-sdk/next/flag-values`
  has it for Next.js.
- **`reportValue` for overrides.** The runtime resolves an override without
  the provider, so `@vercel/flags-core` does not report it. A hook of
  `VercelProvider` can report it with the reason `override`, as v4 did.
- **The build output.** Where the Build Output API of Vercel takes
  `flags-manifest.json`, and how the deployment gives it to Flags Explorer,
  e.g. as the flags of the deployment in the internal scope of the toolbar,
  as the definitions of v4 are today.
- **The deployment adapter of Vercel for Next.js.** It puts the manifest
  into the build output, in `onBuildComplete`.

### The release

- Replace the `TEMPORARY:` values (see "Before publishing").
- Changesets for `flags` v5 and the first versions of the `@flags-sdk/*`
  packages, which have the version `0.0.0`.
- Absolute links in the READMEs: npm does not resolve the relative links
  between the packages.
- Publish the schemas and the system manifests: deploy `apps/docs`.
- A review of `STANDARD.md`, version 1, which is a draft.

### The migration from v4

- A skill or a codemod, e.g. for `flag()` to `defineFlag`, adapters to
  OpenFeature providers, `flags/next` to `@flags-sdk/next`, and
  `(code, group)` to `getPrecomputed`.
- The packages of the monorepo which still use v4: `apps/docs`, the
  adapters (`packages/adapter-*`), the examples and the templates.
- The docs of v5 on flags-sdk.dev.

### Candidates

Not decided yet.

- **More systems.** Fields and system manifests for the systems of the
  adapters of v4: Statsig, PostHog, GrowthBook, Flagsmith, Hypertune,
  Optimizely, Split, Reflag.
- **Next.js:** a helper for flags in the proxy, tests of server actions,
  and a public API of Next.js to derive the secret of precompute.
- **Turbopack collect/emit** instead of the scan, when it collects the whole
  application.
- **Tracing** with OpenTelemetry, as v4 had, e.g. as a hook.
- **More checks in the conformance suite:** `onInit` and `onShutdown`, and
  the reload of the configuration files in development.
- **More frameworks:** Astro, React Router, Remix.
- **A security review** of the overrides and of the precompute codes.

## Deferred

- Hooks registered at runtime, e.g. `runtime.addHooks`, and hooks of one
  flag. Today, hooks come from the configuration, the source, the call
  side and the provider.
- Groups of projects that share overrides, e.g. for microfrontends (see the
  RFC).
- Plaintext overrides without `FLAGS_SECRET`: the Vercel Toolbar signs the
  overrides of these projects now. Applications which read the plaintext
  cookie of v4 ask for it in `overrideEncryptionMode` of
  `/.well-known/vercel/flags`. The toolbar loads it without a secret too,
  but only without authentication, and v5 has no such endpoint. A setting
  of the project, managed in the toolbar, could replace it.
- A configurable logger, e.g. to write debug messages or to send errors to a
  monitoring service.

## Before publishing

Values that must be replaced are marked with `TEMPORARY:` in the source. The
`prepublishOnly` script (`scripts/check-temporary.mjs`) stops a publish while
a file in `src` contains this marker. No file in `src` has the marker now.

## Open questions

- Version skew: copies of the same major version share one runtime, which
  the first copy creates. If a newer copy needs a method that the runtime of
  an older copy does not have, it fails. Possible solution: store a protocol
  number in the shared state, and let each copy examine it.

- Add a timeout for the wait for an initialization? The LaunchDarkly provider
  waits up to 10 seconds by default.

- `FlagValues` with Cache Components: `cacheLife('max')` revalidates a
  static page every 30 days, so the page gets a new token. This helps with
  a rotation of the keys. Alternative: a custom profile without
  revalidation. Not decided.

- `FlagValues` from a published package: the tests use `@flags-sdk/next` as
  a workspace link, so its files are not in `node_modules`. Does Next.js
  compile `'use cache'` of `encrypt-values-cached` also from `node_modules`?
  `@vercel/flags-core` ships `'use cache'` in the same way, which is a good
  sign. A test with a packed tarball would prove it. Not decided.


