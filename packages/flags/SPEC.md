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
| **Flag project** | The project in a system. The `project` of a connection. | a LaunchDarkly project |
| **Provider** (OpenFeature) | The OpenFeature object which resolves the flags of a system. Only this object. | `VercelProvider`, `TypedInMemoryProvider` |
| **Connection** | A provider, plus a flag project. | `defineConnection` |
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
its flag project. A connection can name a different project with
`projectId` and `teamId`, because one project can use the flags of a
different project.

Roles: the roles of OpenFeature (Application Author, Application
Integrator, Provider Author, Integration Author, Library Author), plus the
Framework Author, who writes a framework binding, and the platform, which
writes a deployment adapter.

## Milestones

1. Done: core primitives. Provider types, connections, flags, errors.
2. Done: runtime lifecycle and registration. `runtime`,
   `registerConnections`, `registerFlags`.
3. Done: request scope. `runtime.onInvoke(request, next)` keeps the request
   with `AsyncLocalStorage`. `getEvaluationContext` runs once per request and
   connection.
4. Done: batch evaluation. `evaluate(flag)` and `evaluate([flagA, flagB])`.
5. Done: evaluation context chain. The call side, the flag and the connection
   each create a part of the context (see "Evaluation context chain").
6. Done: overrides. Override cookies, trusted with the shared secret
   `FLAGS_SECRET` (the format of v4) or signed by Vercel (see "Overrides").
7. Done: configuration and default connection. `runtime.configure` with
   `flags.config.ts`. A flag without a connection uses the default connection
   of the application, else the default provider: OFREP, or a fast provider
   that a framework puts in with an alias (see "Configuration" and "Default
   connection").
8. Done: flag value types. Boolean, string, number and object flags, with
   typed default values, options and overrides (see "Flag value types").
9. Done: Next.js. `@flags-sdk/next/plugin` and `@flags-sdk/next/binding`, tested in
   `tests/standard/next` with Turbopack, a deployment adapter, and
   development (see "Framework binding contract"). Only Turbopack is
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
    `flags.config.ts`, the alias of `flags/default-provider`, and the format
    of discovery.

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
`runtime.evaluate`, and `registerConnections` calls
`runtime.registerConnection`. The runtime owns all state and all behavior.

The package needs Node.js 20.19, or 22.12 or newer (`engines`). The CommonJS
build loads `jose`, an ES module, with `require()`, and the overrides read
`.vercel/project.json` with `process.getBuiltinModule`.

Three modules can be replaced with a bundler alias. The runtime imports them
through its own package name, and the build of the SDK keeps these imports:

| Module                   | Default                     | Replaced by                                   |
| ------------------------ | --------------------------- | --------------------------------------------- |
| `flags/default-provider` | OFREP                       | a platform, e.g. with `@vercel/flags-core`    |
| `flags/framework`      | no framework binding        | a framework plugin, e.g. with `@flags-sdk/next/binding`    |
| `flags/config`           | no configuration            | a framework plugin, with `flags.config.ts`    |

A bundler can put more than one copy of the package into one process, e.g.
one copy for each layer of Next.js. Thus, the state is on `globalThis`, under
`Symbol.for('flags.v5.state')`: the runtime, and the lists of connections and
flags. All copies share it. A connection of one copy works with a flag of a
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
calls `runtime.evaluate`. Both accept a flag returned by `defineFlag`, or a
`FlagDefinition` (`key`, `connection`, optional `defaultValue`). Use the
second form to evaluate a key that is only known at runtime. The connection
must come from `defineConnection`.

### Lifecycle alignment with OpenFeature

The provider contract uses the OpenFeature lifecycle without changes:

| OpenFeature (provider spec)                        | This SDK                                            |
| -------------------------------------------------- | --------------------------------------------------- |
| `initialize(context?, domain?)` (2.4)              | Called by `runtime.onInit`, `onInvoke` or the first evaluation. No context and no domain are passed. |
| Initialized only once, also for several domains    | Initialized only once, also for several connections |
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

## Connections

A connection links flags to a flag project in a flag management system
(system), and to the provider which
evaluates them. "Provider" always means the OpenFeature provider.

```ts
const launchdarkly = defineConnection({
  provider: new LaunchDarklyProvider(),
  project: { system: 'launchdarkly', projectId: 'x', teamId: 'y' },
  getEvaluationContext, // optional
});
```

- `project.system` is one of a fixed list of systems. The system
  determines which other fields are required (`ProjectFieldsBySystem`), e.g.
  `launchdarkly` requires `projectId` and `teamId`, `in-memory` requires none.
  `vercel-flags` has an optional `projectId` and an optional `teamId`, for
  the flags of a different project. Without them, it uses the platform
  project.
- The connection is a new frozen object exposing `provider`, `project` and
  `getEvaluationContext`. The provider is not modified.
- `getEvaluationContext(context, request)` is the last step of the
  evaluation context chain (see "Evaluation context chain").
- Several connections can share a provider. It is initialized once.

## Flags

`defineFlag({ key, defaultValue?, connection, getEvaluationContext? })` returns
an async function: `await myFlag()` or
`await myFlag({ evaluationContext })`. The function also exposes `key`,
`defaultValue`, `connection` and `getEvaluationContext`, so the project is
available from every flag.

- Short forms for the common cases:

  | Short form                                  | Full form                                             |
  | ------------------------------------------- | ----------------------------------------------------- |
  | `defineFlag(key)`                           | `defineFlag({ key })`                                 |
  | `defineFlag(key, defaultValue)`             | `defineFlag({ key, type, defaultValue })`             |
  | `defineFlag(connection, key)`               | `defineFlag({ key, connection })`                     |
  | `defineFlag(connection, key, defaultValue)` | `defineFlag({ key, type, defaultValue, connection })` |

  Only the short forms take the type from `defaultValue`: `'Welcome'` gives
  a `string` flag, and the value has the type `string`, not `'Welcome'`.
  Without `defaultValue`, the flag is a boolean. For `options` and
  `getEvaluationContext`, use the full form. The full form is the first
  overload, so TypeScript shows its error first for wrong options.
- `connection` must be returned by `defineConnection`. This is checked at the
  type level and at runtime. Without `connection`, the flag uses the default
  connection (see "Default connection").
- Defining a flag registers its connection with the runtime. Flags are usually
  defined at module scope, so the runtime knows about their connections before
  `onInit`. `registerConnections` is only needed for flags defined later.
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
  `errorCode`), a value of the wrong type or outside of the options, and an
  OFREP response without `value`, which asks for the default of the code. The
  OFREP provider marks that result with an internal symbol, so the runtime
  can detect it.
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
const summerSale = defineFlag({ key: 'summer-sale' }); // boolean
const bannerText = defineFlag({ key: 'banner-text', type: 'string' });
const checkout = defineFlag({
  key: 'checkout',
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
  code without TypeScript, `defineFlag` logs a warning, e.g. `The
  defaultValue of flag "a" is not a boolean. Set type to use a different
  type.` An unknown `type` throws.
- `object` means a JSON object or a JSON array.
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
- With options, the type of the value is the union of the options, e.g.
  `'control' | 'express'`.
- A value that is not one of the options fails (`TYPE_MISMATCH`), so the type
  stays true at runtime. This protects the application from a variant that
  the system added before the code knows it. Objects are compared by their
  content.
- An option of an `object` flag must be `{ value }`, because a JSON object and
  an option object look the same. Otherwise, `defineFlag` throws.
- A `defaultValue` that is not one of the options is a type error, and a
  warning at runtime.

#### Overrides and evaluate

- An override must fit the type and the options. Otherwise, the SDK logs a
  warning, e.g. `The override of flag "a" was ignored, because it is not a
  number.`, and evaluates the flag as usual.
- `evaluate([a, b])` returns the type of each flag, e.g. `[boolean, string]`.
- OFREP has no types: the server returns any JSON value, so all four methods
  use the same request, and the SDK examines the type.

### Evaluating flags with `evaluate`

`evaluate` is a standard function, like `defineFlag`. It calls
`runtime.evaluate`.

```ts
const [showBanner, newCheckout] = await evaluate([showBannerFlag, newCheckoutFlag]);
const enabled = await evaluate(teamFlag, { evaluationContext: { teamId: 'team-1' } });
```

- It accepts one flag or a list of flags. For a list, it returns a tuple with
  the values in the order of the list.
- It accepts flags returned by `defineFlag` and plain `FlagDefinition`s.
- `evaluationContext` is the input of the call side for each flag. Each flag
  receives the same object, so each step of the chain runs once per request
  for all of them. The flags are evaluated in parallel.
- Each flag that fails returns its `defaultValue` and logs the error. If a
  flag without `defaultValue` fails, the call rejects with its
  `FlagEvaluationError`. Thus, `evaluate([flag])` behaves the same as
  `flag()`.

### Evaluation context chain

Three steps create the evaluation context. Each step receives the result of
the step before, so each step further down can change more:

1. The call side gives `evaluationContext`: `myFlag({ evaluationContext })` or
   `evaluate(flags, { evaluationContext })`.
2. `getEvaluationContext(context, request)` of the flag receives it and
   returns the context for the connection.
3. `getEvaluationContext(context, request)` of the connection receives that
   and returns the context for the provider.

```ts
const connection = defineConnection({
  provider,
  project: { system: 'in-memory' },
  getEvaluationContext: async (context: { teamId: string }, request) => ({
    team: await loadTeam(context.teamId),
    user: request?.headers.get('x-user') ?? null,
  }),
});

const teamInsights = defineFlag({ key: 'team-insights', connection });

// API route GET /api/teams/:teamId: the route knows the team
await teamInsights({ evaluationContext: { teamId: params.teamId } });
```

- A missing step gives its input to the next step as it is. Without any step
  and without input, the provider receives an empty context.
- There is no automatic merge. A step that wants to keep fields of the step
  before returns `{ ...context, ... }`.
- `request` is the current `FlagsRequest` (see "The request"). It is
  `undefined` outside of a request. The steps run also outside of a request, e.g. in scripts, because
  the provider needs the context in the shape that the last step creates.
- The SDK calls each step with the step's owner as `this`: the flag or the
  connection.

#### Cache

- Inside a request, each step runs once for each input. A second call with
  the same input, or without input, uses the first result.
  `evaluate([a, b], { evaluationContext })` gives the same object to each
  flag, so the step of a shared connection runs once.
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
- The connection: `ConnectionInput<C>` is what its flags must give. Without a
  step, it is `DefaultConnectionInput` (`EvaluationContext | undefined`).
- The flag: its step must return `ConnectionInput<C>`. The type of its
  `context` is what the call side must give (`FlagEvaluationContext<F>`).
  Without a step, the call side must give `ConnectionInput<C>`.
- The call side: the options are optional if the input can be `undefined`.
  Otherwise `evaluationContext` is required.
- `evaluate` with several flags requires the overlap (intersection) of their
  inputs (`EvaluateContext<F>`), because each flag receives the same object.
- No field has a special meaning, also not `targetingKey`. Not all providers
  use it. A connection that needs it declares it.

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
| API           | `hooks` of the configuration              |
| Client        | `hooks` of `defineConnection`             |
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
export const config = defineConfig({
  hooks: [
    {
      after(hookContext, details) {
        if (details.reason === OVERRIDE_REASON) report(hookContext.flagKey);
      },
    },
  ],
});
```

Without hooks, an override does not create the evaluation context, as
before.

### Events

The runtime listens to `provider.events` from the first initialization
until the shutdown, or until a new configuration replaces the provider.

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
- Handlers for one connection (the client level of OpenFeature) are not
  supported. A handler can filter by `providerName`.

### Tracking

`track(eventName, options?)` and `track(connection, eventName, options?)`
give a tracking event to `provider.track`, e.g. a purchase for an
experiment.

```ts
await track(launchdarkly, 'purchase', {
  evaluationContext: { userId: 'alice' },
  details: { value: 99 },
});
```

- The evaluation context comes from the chain without the flag step: the
  call side gives `evaluationContext` to `getEvaluationContext` of the
  connection. It runs once per request, as for flags.
- `track` waits for the initialization of the provider. OpenFeature does
  not call `track` of a provider which is not ready.
- A provider without `track` ignores the event.
- Errors are logged, not thrown. Only a call with a wrong connection throws.

## Configuration

`runtime.configure(config)` configures the SDK. By convention, the
configuration is the export `config` of `flags.config.ts`, and the framework
binding calls `runtime.configure` with it. Without a framework, the
application calls it at startup.

```ts
// flags.config.ts
import { defineConfig, defineConnection } from 'flags';
import { VercelProvider } from '@vercel/flags-core/openfeature';

export const config = defineConfig({
  defaultConnection: defineConnection({
    provider: new VercelProvider(),
    project: { system: 'vercel-flags' },
    getEvaluationContext,
  }),
});

declare module 'flags' {
  interface Register {
    config: typeof config;
  }
}
```

- `defaultConnection`: the connection of all flags without a connection. It
  must come from `defineConnection`.
- `overrides`: which override tokens the SDK accepts (see "Overrides").
- `hooks`: OpenFeature hooks for all flags (see "Hooks, events and
  tracking").
- `runtime.configure` validates the full configuration at once, and throws
  before it changes anything. A new call replaces the configuration, e.g.
  after a reload in development.
- `onInit` and `onInvoke` initialize the current `defaultConnection`. A new
  call of `configure` replaces it: the old one is not initialized any more,
  and if it was initialized, the runtime closes its provider, unless a flag
  still uses that provider. Thus, a reload in development, or one call of
  `configure` for each copy of `flags.config.ts`, does not leave open
  clients.
- The convention has one name: `flags.config.ts` exports `config`, not a
  default export. A default export would need a separate name anyway for
  `typeof config`, and two accepted names would be ambiguous.

### Types of the configuration

- `defineConfig(config)` returns the configuration as it is, with its exact
  type (a `const` type parameter). It does not use `Register`, so that
  `Register` can refer to `typeof config` without a circular type.
- The application registers the type in `flags.config.ts` itself, with
  `declare module 'flags'`. No generated declaration file is necessary.
  `flags.config.ts` is part of the TypeScript program, so the registration
  applies to the full program.
- With the registration, a flag without a connection has the types of the
  configured default connection (`ConfiguredConnection`), e.g. the input of
  its `getEvaluationContext`. Without it, the flag has the open
  `DefaultConnectionInput`.
- If `flags.config.ts` is not in the TypeScript program, the types fall back
  to the open context. The type check does not fail, but it is less strict.
- `test/register` tests this pattern with its own TypeScript program, as part
  of `type-check`. A registration applies to the full program, so the other
  tests can not contain it.

## Default connection

A flag without a connection uses the default connection. The connection
resolves at the evaluation, not at the definition, so a flag that a module
defines before the configuration also uses the configured connection.

1. The `defaultConnection` of the configuration, if the application sets one.
2. Otherwise, the built-in default connection. Its provider comes from the
   module `flags/default-provider`. The built-in implementation uses OFREP.

```ts
const summerSale = defineFlag({ key: 'summer-sale' });
```

- `flags` exports nothing for Vercel, and there is no wrapper package. The
  application uses the OpenFeature provider of Vercel Flags directly:
  `VercelProvider` of `@vercel/flags-core/openfeature`, like each other
  OpenFeature provider. That provider needs `@openfeature/server-sdk`, which
  is normal for OpenFeature providers.
- The built-in default connection has the system `vercel-flags`. Its context is
  `DefaultConnectionInput`, so it accepts any evaluation context, and gives
  it to the provider as it is. All copies of the package share it.
- The runtime initializes the default connection only when a flag uses it,
  or when `runtime.configure` sets it. Thus, the built-in provider does not
  start when the application has its own default connection.
- A flag with its own connection is not affected by the configuration.

The gradual path:

| Step | What the user does                   | Result                                                                      |
| ---- | ------------------------------------ | --------------------------------------------------------------------------- |
| 0    | Nothing                              | OFREP locally. On Vercel, a fast provider, if the framework puts it in.     |
| 1    | Writes `flags.config.ts`             | Evaluation context and fast evaluations everywhere. No flag changes.        |
| 2    | Adds `connection` to some flags      | More than one provider.                                                     |

### The built-in default provider

The built-in implementation of `flags/default-provider` uses OFREP:

- After `vercel link` and `vercel env pull`, it uses `VERCEL_OIDC_TOKEN` as
  the bearer credential. It reads the token for each request, because
  `vercel env pull` can renew it.
- Without the token, the evaluation throws an error that tells the user to
  run `vercel link` and `vercel env pull`, to set a default connection in
  `flags.config.ts`, or to pass a connection. The error comes at the
  evaluation, not at the definition, so that imports in tests and scripts do
  not fail. A flag with `defaultValue` returns it and logs the error.
- With `NODE_ENV=production`, it logs a warning one time: OFREP sends one
  request for each evaluation, so set a default connection in
  `flags.config.ts`, e.g. with `VercelProvider`.

### Replacing the default provider with an alias

The SDK imports its default provider through its own package name:
`import { createDefaultProvider } from 'flags/default-provider'`. Thus, a
framework or a platform can replace it with a bundler alias at build time,
e.g. with `VercelProvider` of `@vercel/flags-core`.

- The contract: the replacement exports `createDefaultProvider(): Provider`.
- The build of the SDK keeps this import (an esbuild plugin marks it as
  external), and the OFREP code is only in `dist/default-provider.js`. Thus,
  an alias replaces it, and the bundler removes the OFREP code.
- The SDK calls `createDefaultProvider()` one time for each process, because
  the built-in default connection is in the shared state. Next.js can have
  more than one copy of the replacement, e.g. one for each layer, but only
  the first one is called. Thus, a replacement needs no singleton.
- The replacement for Vercel is `@vercel/flags-core/default-provider`. It
  exports `createDefaultProvider()`, which returns a `VercelProvider` with
  the default client of the package. It has a variant for Next.js (export
  condition `next-js`), like `@vercel/flags-core/openfeature`.
- Without a bundler, nothing replaces the module, so the built-in OFREP
  implementation is used.
- The default connection of the application always wins over the
  replacement.

A test with a small Next.js 16 app gave these results. A fake package
imported its own subpath, and the alias pointed it to a different package:

| Bundler   | Alias | Build     | OFREP code in the output | Result |
| --------- | ----- | --------- | ------------------------ | ------ |
| Turbopack | no    | no errors | yes                      | OFREP  |
| Turbopack | yes   | no errors | no                       | fast   |
| webpack   | no    | no errors | -                        | OFREP  |
| webpack   | yes   | no errors | no                       | fast   |

- Turbopack: `turbopack.resolveAlias`, with the key
  `flags/default-provider`.
- webpack: `resolve.alias`, with the key `flags/default-provider$`.

The test also rejected two other ways:

- An optional import of `@vercel/flags-core` in `flags`: Turbopack shows a
  warning in each build without the package, also in applications with their
  own provider. The comments `turbopackIgnore` and `webpackIgnore` remove the
  warning, but then the standalone output of Next.js does not contain the
  package.
- A slot in the shared state that the platform fills before the application
  starts: it needs a change of the entry of each function, and extra files in
  each function.

### OFREP

The OpenFeature Remote Evaluation Protocol (OFREP, version 0.4) evaluates
flags with HTTP requests. The SDK has an internal OFREP provider. It is not a
public API.

- It uses `POST /ofrep/v1/evaluate/flags/{key}` with `{ "context": … }`, one
  request for each evaluation. It does not use the bulk endpoint, which is
  for clients that keep all flags.
- A response with `value` gives `value`, `reason`, `variant` and `metadata`.
  A response without `value` asks for the default of the code: the provider
  returns the default with the reason `DEFAULT`.
- Errors: a 400 response gives its `errorCode` and `errorDetails`. 404 gives
  `FLAG_NOT_FOUND`. 401, 403 and other status codes give `GENERAL` with a
  clear message. A network error rejects.
- After a 429 response, the provider sends no requests until the time of
  `Retry-After` (seconds or a date, one second without a valid value). Until
  then, each evaluation fails with `GENERAL`.
- The base URL of Vercel Flags is temporary, because the endpoint does not
  exist yet (see "Before publishing").

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
- The value must be a boolean for now. Otherwise, the SDK logs a warning and
  evaluates the flag as usual.
- The SDK reads the token once per request. Outside of a request, there are
  no overrides.
- An invalid token gives no overrides. The SDK logs one warning with the
  reason, e.g. `flags: The override cookie was ignored. Reason: wrong-scope.`
  It never logs the token, because the token can contain information about
  the user.

### Which tokens the SDK accepts

The SDK needs no configuration:

1. If `FLAGS_SECRET` is set, the SDK accepts only the tokens of this shared
   secret. This is the behavior of v4.
2. Otherwise, on Vercel or locally with a linked project (when `VERCEL` or
   `VERCEL_OIDC_TOKEN` is set), the SDK accepts only the tokens that Vercel
   signs for this project. Locally, Flags Explorer signs them, and
   `vercel env pull` writes `VERCEL_OIDC_TOKEN`.
3. Otherwise, the SDK accepts no tokens.

The SDK reads these environment variables when a token needs them, because
they can change until then. An empty variable counts as missing.

The option `overrides` of the configuration (see "Configuration") changes the
defaults. The trust comes only from the options and the environment, never
from the token.

- `secret`: the shared secret. The default is `FLAGS_SECRET`. `false` accepts
  no tokens of the shared secret. An explicit secret that is not valid throws
  at once.
- `vercel`: `true` accepts signed tokens with the defaults, an object sets
  options, and `false` accepts no signed tokens. With an explicit value, the
  rule "only the shared secret if `FLAGS_SECRET` is set" does not apply, so
  both methods can be active, e.g. during a migration. Explicit options are
  validated at once.

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
- The issuer in the code is temporary: a test issuer of the team
  testing-internal (`https://kms.vercel.com/e97b43ed-…`). It signs with RS512.
  It must be replaced with the real issuer before publishing (see "Before
  publishing").
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
    it is expired. In Vercel Functions, the token can be missing from the
    environment, but there `VERCEL_PROJECT_ID` is set.
  - If the project ID or the environment is not known, the SDK throws an
    `OverridesError`.
- The token is a JWT with these claims: `iss` (the issuer), `aud`
  (`vercel:flag-overrides`), `ver` (`1`), `pur` (`flag-overrides`), `iat`,
  `exp`, `scope` (`projectId`, `environments`, optional `teamId`) and
  `overrides`.
- The SDK verifies: the algorithm (ES256 or RS512), the signature, the
  issuer, the audience, the time (5 seconds of tolerance), the lifetime, the
  version, the purpose, and that the overrides are JSON. The scope must have
  the project and the environment of the host, and its team if known.
- The lifetime (`exp - iat`) is at most 24 hours. `maxLifetimeSeconds`
  changes it, e.g. to one week.
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
connections. An application has only one runtime, so `Runtime` is exported
only as a type. The lifecycle methods map to the AWS Lambda phases. Framework
bindings call them.

- `onInit()`: call once before the first request (Lambda init phase). It
  initializes the providers of all registered connections in parallel, and
  waits for them. It logs failures and does not throw. Use `initialize()` for
  local work, e.g. to parse an embedded fallback configuration. Do not rely on
  connections that you open here: Lambda can freeze the process between
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
- A flag waits only for the provider of its connection. If the initialization
  of that provider is in progress, the flag waits for it before it calls the
  provider.
- `waitForInitialization()`: waits until all running initializations are
  finished. It does not throw.
- `onShutdown()`: call once when the process stops. It waits for running
  initializations, then calls `onClose()` on each provider that was
  initialized. It logs errors and does not throw. After a shutdown, the next
  use initializes the providers again.
- A provider is initialized only once, also when several connections share
  it. Concurrent callers share one initialization. `initialize()` is called
  synchronously, so the work starts immediately.
- The provider of a connection that is not registered is initialized on its
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
2. `runtime.setRequestSource(source)`: for frameworks that can give the
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
| `flags` | runtime, `defineFlag`, connections, overrides, `evaluate`, `track`, `flags/manifest`, `flags/tooling`, the command line `flags` | the application, and the framework packages |
| `@flags-sdk/next` | `/binding`, `/plugin` (`withFlags`), `/precompute`, `/manifest` (the route), and the loaders of Turbopack | `next.config.ts`, `proxy.ts`, one route file |
| `@flags-sdk/vite` | the generic Vite plugin: the binding, `flags.config.ts`, `'use flags'` modules, the manifest, the default provider of the platform | the framework packages for Vite |
| `@flags-sdk/sveltekit` | `/binding`, `/vite` | `vite.config.ts` |
| `@flags-sdk/nuxt` | the module, `/binding`, `/plugin` (Nitro) | `nuxt.config.ts` |
| `@flags-sdk/tanstack-start` | `/binding`, `/vite` | `vite.config.ts` |
| `@flags-sdk/hono` | the middleware | the setup of the app |
| `@flags-sdk/express` | the middleware | the setup of the app |

- The code of the application imports only `flags`. The framework packages
  are only for the setup, one time. Precompute of Next.js is the
  exception: it is a feature of Next.js, so its pages and its proxy import
  `@flags-sdk/next/precompute`.
- A framework package imports its framework, e.g. `isRedirect` of
  `@sveltejs/kit`, and has a peer dependency on it. A framework package
  only uses the public API of `flags`.
- `flags/tooling` is the public API for framework packages and build tools:
  `findFlagsModules`, `hasUseFlagsDirective`, `addSelfRegistration`,
  `writeManifestFromBuild`, `MANIFEST_FILE`, `findConfigFile`,
  `optionIndex`, and `registerFramework`. It is part of the contract of a
  framework binding.
- `registerFramework(setupFramework)` registers a binding without the
  alias of `flags/framework`, for a runtime which loads `flags` from
  `node_modules`, e.g. Nitro in development. The first binding wins, as
  with the alias.

## Framework binding contract

A framework binding connects the SDK to a framework. It has two parts:

1. **A build plugin**, e.g. `withFlags` of `@flags-sdk/next/plugin`. It sets two
   bundler aliases:
   - `flags/framework` to the module of the binding, e.g. `@flags-sdk/next/binding`.
   - `flags/config` to the `flags.config.ts` of the application, if it exists.
2. **The module of the binding** behind `flags/framework`. It exports
   `setupFramework(runtime)`, which the runtime calls one time, before the
   first evaluation and in `onInit`.

The application does not import the module of the binding. The runtime
imports `flags/framework` itself, so the binding works in each bundle
that uses `flags`. Without a plugin, `flags/framework` and `flags/config`
are empty modules.

The module of the binding:

- must not import `flags` statically, because `flags` imports it. It gets
  the runtime as an argument.
- loads the configuration with a dynamic `import('flags/config')`, because
  `flags.config.ts` imports `flags`.
- uses only the public API of the SDK, so that a framework can take it over,
  e.g. as its own module behind the same alias.

`setupFramework` uses these methods of the runtime:

| Method                           | Purpose                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `runtime.setRequestSource(fn)`   | Gives the current request, if no middleware wraps the handler (see "The request")          |
| `runtime.setConfigSource(fn)`    | Gives the configuration. In development, the runtime loads it again before each evaluation |
| `runtime.setRethrow(fn)`         | Throws the errors again which the framework must receive                                    |

- `setConfigSource`: in production, the runtime calls it one time. In
  development (`NODE_ENV` is not `production`), it calls it before each
  evaluation, and configures again when it returns a different object. Thus,
  a change of `flags.config.ts` applies without a restart, and `configure`
  closes the old default connection. If the source throws, the evaluation
  fails, and the next one tries again.
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
| Load `flags.config.ts`                 | The plugin sets the alias of `flags/config`, the binding calls `setConfigSource`           | `runtime.configure(config)` at startup                     |
| Give the request to the runtime        | `runtime.onInvoke(request, next)` in a middleware, or `setRequestSource`                    | `runtime.onInvoke` in a middleware                         |
| Convert the request                    | The binding gives `FlagsRequestInit`, e.g. a Web `Request`                                  | The application converts it, e.g. Node.js headers          |
| Let signals of the framework through   | `setRethrow`                                                                                | Not necessary                                              |
| `onInit` and `onShutdown`              | At startup, and when the process stops, if the framework has such hooks                     | At startup, and on `SIGTERM`                               |
| Fast evaluations on Vercel at step 0   | The deployment adapter, or the plugin for a platform build, sets the alias of `flags/default-provider` | Not possible: OFREP, with a warning in production          |
| Register `'use flags'` modules         | A compiler plugin calls `registerFlags` (see "Discovery")                                   | `registerFlags` by hand, if necessary                      |

Rules for each binding:

- Use only the export `config` of `flags.config.ts`.
- Give the request as `FlagsRequestInit`. Give the same `headers` object
  during one request.
- Set the alias of `flags/default-provider` only when the build is for a
  platform that has a fast provider. Do not set it in development, so that
  development uses OFREP or the configuration.
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
| `@flags-sdk/next/plugin`     | `withFlags(nextConfig, { dir? })`, the build plugin               | `next.config.ts`           |
| `@flags-sdk/next/binding`            | `setupFramework`, the module of the binding                     | the alias, not the app     |
| `@flags-sdk/next/precompute` | precompute, for the transition (milestone 11)                     | the proxy and pages        |

- `withFlags` sets the aliases for Turbopack (`turbopack.resolveAlias`). It
  supports only Turbopack: its `webpack` function throws, so a build with
  `--webpack` stops with a clear error. It keeps the aliases and the rules
  of the application. It finds
  `flags.config.ts` (`.ts`, `.mts`, `.js` or `.mjs`) in the directory of the
  application or in `src`.
- The request: no middleware wraps the rendering, but `headers()` returns the
  same object during one request. Thus, `@flags-sdk/next/binding` uses
  `runtime.setRequestSource` with `headers()` and `cookies()`. The test shows
  one call of `getEvaluationContext` for five evaluations in one request.
- Outside of a request, e.g. at build time, `headers()` throws, so the source
  returns `undefined`. The static page of the test evaluates with the user
  `anonymous`.
- Signals: `@flags-sdk/next/binding` sets `runtime.setRethrow(unstable_rethrow)`. During
  the build, `headers()` throws "Dynamic server usage" to tell Next.js that a
  page is dynamic. Without `setRethrow`, the SDK caught it, and the build
  failed.
- The alias of the platform: the Vercel adapter (Adapter API,
  `NEXT_ADAPTER_PATH`, stable since Next.js 16.2) sets it in `modifyConfig`,
  during `phase-production-build`. The test adapter of `tests/standard/next`
  does this. Adapters run only for builds, so development uses OFREP or the
  configuration.
- Not done yet: `onInit` and `onShutdown` (Next.js has no hooks for them,
  except `register` in `instrumentation.ts`), the proxy (`proxy.ts`), which
  gets the full `NextRequest`, and server actions.

`tests/standard/next` tests the binding with two builds: Turbopack, and
Turbopack with a test adapter of the platform. `pnpm test:e2e` runs 16
tests with HTTP requests, without a browser. `next dev` was also
tested by hand, with a change of `flags.config.ts` during the run.

**SvelteKit** (done). Package: `@flags-sdk/sveltekit`. Guide:
`../framework-sveltekit/README.md`.

- `flags()` of `@flags-sdk/sveltekit/vite` uses `@flags-sdk/vite` with the
  binding `@flags-sdk/sveltekit/binding`. The plugin resolves the binding
  from the project, points `flags/config` to `flags.config.ts`, and bundles
  `flags` and `@flags-sdk/sveltekit` into the server code
  (`ssr.noExternal`), so that the aliases reach the SDK.
- The request: `getRequestEvent()` of `$app/server` (SvelteKit 2.20 or
  newer), with the headers and the URL of the request. The application
  needs no `handle` hook. Outside of a request, there is no request.
- The rethrow: `isRedirect()` and `isHttpError()` of `@sveltejs/kit`. The
  plugin deduplicates `@sveltejs/kit` (`resolve.dedupe`), so that the
  binding and the application use one copy, and `isRedirect()` recognizes
  the `redirect()` of the application.
- The alias of `flags/default-provider`: the adapter
  (`@sveltejs/adapter-vercel`) runs after the Vite build, so it is too late
  for an alias. Thus, the Vite plugin sets it: during a build with
  `VERCEL`, to `@vercel/flags-core/default-provider` if the project has it,
  or to the module of the option `defaultProvider`. It resolves the module
  from the project, in a `resolveId` hook with the order `pre`, before the
  resolver of Vite resolves `flags/default-provider` through the exports
  of the package. `tests/standard/sveltekit` tests it with a platform
  variant.

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
- The default provider: during a build on Vercel, the provider of
  `@vercel/flags-core`, if the project has it, or the module of the
  option `defaultProvider` (`modules: [['@flags-sdk/nuxt', {
  defaultProvider }]]`), as an alias of Nitro.

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
- The default provider: the same as for SvelteKit.

**Astro**

- Its integrations can change the configuration of the bundler, and it has
  a request context for a source. Not examined yet.

### Registration

- `registerConnections(connections)` registers connections. Use it when you
  have the connections.
- `registerFlags(moduleExports)` registers the connections of all flags that a
  module exports. Use it with a module that only exports flags. It throws if
  an export is not a flag, and then registers nothing.
- `defineFlag` registers the connection of the flag. Thus, you only need these
  functions for flags that are defined after `onInit`, e.g. in modules that are
  imported lazily, or for plain flag objects.
- The framework plugins call `registerFlags` for each `'use flags'` module
  (see "Discovery").

## Flag values in the page

A page can contain the values of its flags, for Flags Explorer and for the
analytics of Vercel. The format is section 11 of `STANDARD.md`: the element
`<script type="application/json" data-flag-values>`, as in v4.

- `flags` has the standard: `encryptFlagValues`, `decryptFlagValues` (only
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
- No authenticity: each visitor can encrypt other values with the public
  key. This is acceptable for analytics, as for each data from the client.
  The intake must not trust the values for other purposes.
- For now, flags-sdk.dev publishes the key set at
  `/api/flag-values/jwks.json`, from the environment variable
  `FLAG_VALUES_PUBLIC_KEY`. The private key is in `FLAG_VALUES_PRIVATE_KEY`
  of the same project. `apps/docs/scripts/generate-flag-values-keys.mjs`
  creates a key pair.
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
  `initialize`, not in the constructor, so `defineConnection` in such a
  module is fine.
- The directive is found in the directive prologue (comments, whitespace,
  and string literals at the start), as for `'use client'`. It is not a
  parser.
- The framework plugins append a self-registration to each flags module:
  `import * as self from './flags'; registerFlags(self);`. `registerFlags`
  registers the connections of the exports, also of plain flag objects. A
  flag without a connection uses the default connection, which is not
  registered. Without a plugin, call `registerFlags` by hand.

### The manifest

`createManifest(modules)` (export `flags/manifest`) creates the manifest
from the exports of the flags modules. It evaluates nothing.

```json
{
  "version": 1,
  "definitions": {
    "banner-text": {
      "type": "string",
      "options": [{ "value": "Welcome" }, { "value": "Summer sale!" }],
      "defaultValue": "Welcome",
      "description": "The text of the banner",
      "declaredInCode": true,
      "sources": [{ "module": "src/lib/flags.ts", "export": "bannerText" }]
    }
  }
}
```

- The fields have the names of the definitions of Flags Explorer
  (`options`, `defaultValue`, `description`, `declaredInCode`), plus `type`,
  `connection` and `sources`. The links come from the connection (see
  "Links to the dashboard").
- `defineFlag` has an optional `description` for it.
- An export which is not a flag throws. Two exports with the same key must
  declare the same flag; then the flag has two sources.
- The keys are sorted, so the file is stable.

### Links to the dashboard

The links to the dashboard of a system (the `origin` of v4) are not in
the manifest. The manifest has only the variables. A tool builds the links
when it shows a flag. Thus, a system can change its links without a new
build of the application.

1. Each connection is in `connections` of the manifest: its system, the
   URL of its system manifest, and the variables of its project (the
   fields of `project`, without `system` and `systemManifest`). The
   definitions refer to it by an id: the system, and a number if two
   connections have the same system. Two connection objects with the same
   project are one connection. A flag without a connection has the default
   connection, so the Next.js route loads `flags.config.ts` first
   (`runtime.prepare()`).
2. Vercel Flags uses the platform project of Vercel as its flag project.
   Thus, its variables `projectId`, `environment` and `teamId` come from
   the environment of the build, like the platform project of the
   overrides (`findPlatformProject`). The fields `projectId` and `teamId`
   of the connection override them, for the flags of a different project.
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
- A platform puts the file into its build output. The test adapter of
  `tests/standard/next` copies it in `onBuildComplete`. Where the Build
  Output API of Vercel expects it is open.
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

- **Flags Explorer.** Read the flags manifest of v5: in development at
  `/.well-known/flags/manifest.json`, and from the build output on Vercel.
  Build the links to the dashboard from the system manifests
  (`resolveFlagLinks`). Write the override cookies of section 10 of
  `STANDARD.md`.
- **OFREP.** The endpoint of Vercel Flags for OFREP, with the OIDC token of
  the project as the credential. It runs locally at
  `http://localhost:3031/ofrep/v1/` now (`VERCEL_OFREP_BASE_URL` is
  `TEMPORARY:`). The production endpoint follows.
- **KMS for flag overrides.** Flags Explorer signs override tokens with Vercel
  KMS (`vercel-flag-overrides`), with the claims of section 10.2 of
  `STANDARD.md`, and publishes the public keys at its issuer
  (`VERCEL_TOOLBAR_ISSUER` is `TEMPORARY:`).
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
  `flags-manifest.json`, so that Flags Explorer can read it from a
  deployment.
- **The deployment adapter of Vercel for Next.js.** It sets the alias of
  `flags/default-provider` to `@vercel/flags-core/default-provider`, and puts
  the manifest into the build output, as `tests/standard/next/adapter.mjs`
  does.

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
- **Batch evaluation with OFREP.** `evaluate([…])` could use the bulk
  endpoint of OFREP, with one request instead of one for each flag.
- **Next.js:** a helper for flags in the proxy, tests of server actions,
  and a public API of Next.js to derive the secret of precompute.
- **Turbopack collect/emit** instead of the scan, when it collects the whole
  application.
- **Tracing** with OpenTelemetry, as v4 had, e.g. as a hook.
- **More checks in the conformance suite:** `onInit` and `onShutdown`, the
  reload of `flags.config.ts` in development, and the default provider of a
  platform.
- **More frameworks:** Astro, React Router, Remix.
- **A security review** of the overrides and of the precompute codes.

## Deferred

- Hooks registered at runtime, e.g. `runtime.addHooks`, and hooks of one
  flag. Today, hooks come from the configuration, the connection, the call
  side and the provider.
- Groups of projects that share overrides, e.g. for microfrontends (see the
  RFC).
- A configurable logger, e.g. to write debug messages or to send errors to a
  monitoring service.

## Before publishing

Values that must be replaced are marked with `TEMPORARY:` in the source. The
`prepublishOnly` script (`scripts/check-temporary.mjs`) stops a publish while
a file in `src` contains this marker.

- The issuer of the Vercel overrides (`VERCEL_TOOLBAR_ISSUER` in
  `src/overrides/vercel.ts`): replace it with the real issuer of the Vercel
  Toolbar.
- The key set of the flag values (`VERCEL_FLAG_VALUES_JWKS_URL` in
  `src/flag-values.ts`): it is
  `https://flags-sdk.dev/api/flag-values/jwks.json` now. Move the key pair
  (`FLAG_VALUES_PUBLIC_KEY` and `FLAG_VALUES_PRIVATE_KEY` of the project
  `flags-sdk-dev`) to flags.vercel.com, and replace the URL.
- The OFREP base URL of Vercel Flags (`VERCEL_OFREP_BASE_URL` in
  `src/default-provider.ts`): it is the local endpoint
  `http://localhost:3031` now. Replace it with the production endpoint.

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


