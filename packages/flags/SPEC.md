# Flags SDK v5 spec (draft)

Working notes for the next major version. Not published (`files` only includes `dist`).

## Milestones

1. Done: core primitives. Provider types, connections, flags, errors.
2. Done: runtime lifecycle and registration. `runtime`,
   `registerConnections`, `registerFlags`.
3. Done: request scope. `runtime.onInvoke(request, handler)` keeps the
   request with `AsyncLocalStorage`. `getEvaluationContext` runs once per
   request and connection. The `onInvoke` extension of providers runs once
   per request.
4. Batch evaluation. `evaluate([flagA, flagB])` and the `resolveBatch`
   extension.
5. Framework integrations. Next.js and SvelteKit call the `runtime` methods.
   Compiler plugins for the `'use flags'` directive call `registerFlags`.
6. OpenFeature parity. Provider hooks, events and tracking. Flag types other
   than boolean.
7. Tooling. Links to the flag in the dashboard of the platform (`origin`).
   Flag discovery for tools such as Flags Explorer.
8. Standard. Write the spec with normative words (MUST, SHOULD). Add a
   conformance test suite that provider authors can run.

## Providers

A provider is any object structurally compatible with the OpenFeature server
`Provider` interface. The SDK does not depend on `@openfeature/*`; it declares
its own minimal types (`Provider`, `EvaluationContext`, `ResolutionDetails`,
`Logger`) which OpenFeature providers satisfy as-is.
`src/openfeature.test.ts` checks these types against `@openfeature/server-sdk`,
which is only a dev dependency.

The SDK calls providers directly instead of going through the OpenFeature
client, so it owns initialization, evaluation and shutdown.

### Provider extension

Capabilities beyond the OpenFeature spec live on an optional extension object
under `provider[Symbol.for('flags.provider-extension')]`. The SDK detects each
capability and falls back when it is missing.

```ts
interface ProviderExtension<K extends string = string> {
  /**
   * Type-only. Declares the flag keys this provider knows about. Never set
   * at runtime.
   */
  readonly types?: { readonly flagKey: K };

  /**
   * Called once per request. Lets the provider prepare work that later
   * evaluations in the same request reuse, e.g. making sure data is fresh.
   */
  onInvoke?(request: { headers: ReadonlyHeaders }): Promise<void> | void;

  /** Resolves several flags in a single call. */
  resolveBatch?(
    flags: { key: K; defaultValue?: boolean }[],
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>[]>;
}
```

Fallbacks: `onInvoke` is a no-op, and `resolveBatch` becomes one
`resolveBooleanEvaluation` call per flag.

A provider that declares `types.flagKey` restricts the keys `defineFlag`
accepts. Providers that don't accept any string key. Example:

```ts
class MyProvider implements Provider {
  declare readonly [providerExtension]?: ProviderExtension<'a' | 'b'>;
}
```

### Lifecycle alignment with OpenFeature

The provider contract uses the OpenFeature lifecycle without changes:

| OpenFeature (provider spec)                        | This SDK                                            |
| -------------------------------------------------- | --------------------------------------------------- |
| `initialize(context?, domain?)` (2.4)              | Called by `runtime.onInit`, `onInvoke` or the first evaluation. No context and no domain are passed. |
| Initialized only once, also for several domains    | Initialized only once, also for several connections |
| `shutdown` / `onClose` (2.5)                       | Called by `runtime.onShutdown`                      |
| Re-initialization after shutdown is allowed (2.5.2)| The next use initializes the provider again         |
| Status from events (2.8)                           | Status from the `initialize` promise. Events are deferred. |
| `on context changed` (2.6)                         | Not used. It is for static-context (client) providers. |
| `track` (2.7)                                      | Deferred                                            |
| No per-request hook                                | `onInvoke` in the provider extension                |

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

A connection links flags to a project on a platform, and to the provider which
evaluates them. "Provider" always means the OpenFeature provider.

```ts
const launchdarkly = defineConnection({
  provider: new LaunchDarklyProvider(),
  project: { platform: 'launchdarkly', projectId: 'x', teamId: 'y' },
  getEvaluationContext, // optional
});
```

- `project.platform` is one of a fixed list of platforms. The platform
  determines which other fields are required (`ProjectFieldsByPlatform`), e.g.
  `launchdarkly` requires `projectId` and `teamId`, `in-memory` requires none.
- The connection is a new frozen object exposing `provider`, `project` and
  `getEvaluationContext`. The provider is not modified.
- `getEvaluationContext(request: { headers: ReadonlyHeaders })` is called once
  per request.
- Several connections can share a provider. It is initialized once.

## Flags

`defineFlag({ key, defaultValue?, connection })` returns an async function:
`await myFlag()`. The function also exposes `key`, `defaultValue` and
`connection`, so the project is available from every flag.

- `connection` must be returned by `defineConnection`. This is checked at the
  type level and at runtime.
- Defining a flag registers its connection with the runtime. Flags are usually
  defined at module scope, so the runtime knows about their connections before
  `onInit`. `registerConnections` is only needed for flags defined later.
- The provider is initialized before its first evaluation. Concurrent
  evaluations share one initialization, and a failed initialization is retried
  on the next evaluation.
- Boolean only for now. A `type` field will be added later.
- Evaluation context is empty until `getEvaluationContext` is wired up.
- The logger passed to providers is `console`.
- Errors: a provider can throw, return details with an `errorCode`, or return a
  non-boolean value (`TYPE_MISMATCH`). All are turned into a
  `FlagEvaluationError` with the flag key and an OpenFeature error code
  (`GENERAL` if the error has none). If `defaultValue` is set, the error is
  logged and `defaultValue` returned. Otherwise the error is thrown.
- A link to the flag in the provider's dashboard (`origin`) will be added
  later.

### Evaluating several flags

`evaluate([flagA, flagB])` resolves several flags in one call, avoiding the
overhead of one promise chain per flag. The SDK groups the flags by provider
and calls `resolveBatch` once per provider when available. Results are returned
as a tuple matching the input order.

## Runtime lifecycle

The SDK exports one `runtime` instance. It coordinates the providers of all
connections. An application has only one runtime, so `Runtime` is exported
only as a type. The lifecycle methods map to the AWS Lambda phases. Framework
integrations call them.

- `onInit()`: call once before the first request (Lambda init phase). It
  initializes the providers of all registered connections in parallel, and
  waits for them. It logs failures and does not throw. Use `initialize()` for
  local work, e.g. to parse an embedded fallback configuration. Do not rely on
  connections that you open here: Lambda can freeze the process between
  requests.
- `onInvoke(request, handler)`: call for each request, inside the request
  handler. Pass the code that handles the request as `handler`, and return its
  result. Flags that are evaluated inside `handler` belong to the request (see
  "Request scope"). `onInvoke` starts the initialization of providers that are
  not initialized, retries failed initializations, and starts the `onInvoke`
  extension of each registered provider. It does not wait for this work: a
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

### Request scope

`runtime.onInvoke` keeps the request with `AsyncLocalStorage` while `handler`
runs. This is similar to transaction context propagation in OpenFeature. The
SDK does not use `enterWith`, because it changes the context of the caller.

- `getEvaluationContext(request)` of a connection runs on the first evaluation
  of a flag of that connection in the request. Its result is used for all
  flags of the connection in the same request. It does not run for
  connections that the request does not use.
- If `getEvaluationContext` throws, the flags of that connection fail for the
  rest of the request. They return `defaultValue` or throw a
  `FlagEvaluationError`. It does not run again in the same request.
- Each connection has its own context, also when connections share a
  provider.
- The `onInvoke` extension of a provider runs once per request, after the
  initialization of the provider. `runtime.onInvoke` starts it for the
  providers of registered connections. For other providers, the first
  evaluation in the request starts it.
- A flag waits for the initialization and the `onInvoke` extension of its
  provider. It gets the context at the same time.
- If the `onInvoke` extension fails, the SDK logs the error, and the
  evaluations continue. The provider can still evaluate with the data it has.
- Outside of `runtime.onInvoke`, e.g. in scripts or at build time, flags use
  an empty context. `getEvaluationContext` and the `onInvoke` extension do not
  run.

### Registration

- `registerConnections(connections)` registers connections. Use it when you
  have the connections.
- `registerFlags(moduleExports)` registers the connections of all flags that a
  module exports. Use it with a module that only exports flags. It throws if
  an export is not a flag, and then registers nothing.
- `defineFlag` registers the connection of the flag. Thus, you only need these
  functions for flags that are defined after `onInit`, e.g. in modules that are
  imported lazily.

### Build tooling (planned)

Modules starting with a `'use flags'` directive export only flags. Framework
compiler plugins will make sure their connections are registered before
startup, so nobody has to call `registerConnections` by hand. Two options:

- At build time, import these modules, read the `connection` of each export and
  generate the registration code.
- Preferred: inject a self-import into each such module, so the module can read
  its own exports and pass their connections to `registerConnections`.

The injected code calls `registerFlags` with the exports of the module. Until
then, call `registerFlags` or `registerConnections` manually.

## Deferred

OpenFeature features that only work through the OpenFeature client. Since the
SDK calls providers directly, it has to run these itself to stay compatible.

- **Provider hooks.** `provider.hooks?: Hook[]` lets a provider run code around
  its own evaluations, in four stages: `before` (can return extra evaluation
  context), `after`, `error` and `finally`. The OpenFeature client runs them,
  not the provider. To support them, run `before` hooks before resolving and
  the other stages afterwards. OpenFeature also has hooks registered globally,
  per client and per call; whether the SDK offers those is a separate decision.
- **Provider events.** `provider.events?` is an emitter that the provider fires
  on its own: `PROVIDER_READY`, `PROVIDER_ERROR`,
  `PROVIDER_CONFIGURATION_CHANGED` and `PROVIDER_STALE`. Nothing listens unless
  the SDK subscribes. Could be used to track provider status or to refresh
  stale data.
- **Tracking.** `provider.track?(eventName, context, details)` records events
  such as conversions for experiments. The SDK could expose it as a
  pass-through.
- Value types other than boolean.

## Open questions

- Add a timeout for the wait for an initialization? The LaunchDarkly provider
  waits up to 10 seconds by default.

- Does `evaluate([...], context)` take an explicit evaluation context, and does
  it replace or merge with the one from `getEvaluationContext`?
- If one flag in `evaluate` fails and has no `defaultValue`, does the whole call
  reject (like `Promise.all`), or does only that entry fail?

