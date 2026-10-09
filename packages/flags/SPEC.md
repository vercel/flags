# Flags SDK v5 spec (draft)

Working notes for the next major version. Not published (`files` only includes `dist`).

## Milestones

1. Done: core primitives. Provider types, connections, flags, errors.
2. Done: runtime lifecycle and registration. `runtime`,
   `registerConnections`, `registerFlags`.
3. Done: request scope. `runtime.onInvoke(request, next)` keeps the request
   with `AsyncLocalStorage`. `getEvaluationContext` runs once per request and
   connection.
4. Done: batch evaluation. `evaluate(flag)` and `evaluate([flagA, flagB])`,
   with an explicit context whose type comes from the connections.
5. Framework integrations. Small adapters for Hono, Express, SvelteKit,
   TanStack Start, Nuxt and Next.js call the `runtime` methods (see
   "Framework integrations").
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

The SDK supports OpenFeature providers as they are. It does not require
providers to implement more than the OpenFeature spec.

### Architecture

All public functions call the `runtime`. For example, a flag calls
`runtime.evaluate`, and `registerConnections` calls
`runtime.registerConnection`. The runtime owns all state and all behavior.

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
| Status from events (2.8)                           | Status from the `initialize` promise. Events are deferred. |
| `on context changed` (2.6)                         | Not used. It is for static-context (client) providers. |
| `track` (2.7)                                      | Deferred                                            |
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
- The key keeps its literal type. Any string is accepted. Typed keys (a fixed
  list of keys for each provider) are not planned for now.
- Boolean only for now. A `type` field will be added later.
- Inside `runtime.onInvoke`, the context comes from `getEvaluationContext` of
  the connection. Outside, it is empty.
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
- A link to the flag in the provider's dashboard (`origin`) will be added
  later.

### Evaluating flags with `evaluate`

`evaluate` is a standard function, like `defineFlag`. It calls
`runtime.evaluate`.

```ts
const [showBanner, newCheckout] = await evaluate([showBannerFlag, newCheckoutFlag]);
const enabled = await evaluate(myFlag, { user: { id: 'user-1' } });
```

- It accepts one flag or a list of flags. For a list, it returns a tuple with
  the values in the order of the list.
- It accepts flags returned by `defineFlag` and plain `FlagDefinition`s.
- Each flag gets the context of its connection once per request, and waits
  for its provider. The flags are evaluated in parallel.
- Each flag that fails returns its `defaultValue` and logs the error. If a
  flag without `defaultValue` fails, the call rejects with its
  `FlagEvaluationError`. Thus, `evaluate([flag])` behaves the same as
  `flag()`.

#### Explicit context

`evaluate` accepts an optional context as its second argument.

- The SDK merges its fields over the context of each flag: a field in the
  explicit context replaces the same field, and all other fields stay. The
  merge is shallow. Fields that are `undefined` are ignored.
- Outside of a request, the explicit context is the full context.
- The explicit context does not change the request context of later
  evaluations.
- The type comes from the connections. The return type of
  `getEvaluationContext` defines the shape of the context of a connection
  (`FlagContext`). The explicit context is the overlap (intersection) of the
  contexts of all flags in the call, with all fields optional
  (`EvaluateContext`). The SDK uses the intersection, not the union, because
  it merges the same object into the context of each flag. Thus, the object
  must be valid for every connection.
- No field has a special meaning, also not `targetingKey`. Not all providers
  use it. A connection that needs it declares it in `getEvaluationContext`.
- A connection without `getEvaluationContext` accepts any context.

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

### Request scope

`runtime.onInvoke` keeps the request with `AsyncLocalStorage` while `next`
runs. Work that `next` starts keeps the scope, also after `next` returns, e.g.
in Express. This is similar to transaction context propagation in OpenFeature.
The SDK does not use `enterWith`, because it changes the context of the
caller.

- The request can be a Web `Request`, a Node.js `IncomingMessage`, or any
  object with `headers`. `getEvaluationContext` always receives Web `Headers`.
  The SDK converts Node.js headers only when a connection needs them. It skips
  HTTP/2 pseudo-headers, e.g. `:path`.
- `getEvaluationContext(request)` of a connection runs on the first evaluation
  of a flag of that connection in the request. Its result is used for all
  flags of the connection in the same request. It does not run for
  connections that the request does not use.
- If `getEvaluationContext` throws, the flags of that connection fail for the
  rest of the request. They return `defaultValue` or throw a
  `FlagEvaluationError`. It does not run again in the same request.
- Each connection has its own context, also when connections share a
  provider.
- A flag waits for the initialization of its provider. It gets the context at
  the same time.
- Outside of `runtime.onInvoke`, e.g. in scripts or at build time, flags use
  an empty context. `getEvaluationContext` does not run.

### Framework integrations (planned)

Each integration is a small adapter. Most frameworks have a middleware with a
`next` function, so the adapter is one line:

```ts
// Hono
app.use((c, next) => runtime.onInvoke(c.req.raw, next));

// Express
app.use((req, res, next) => runtime.onInvoke(req, next));

// SvelteKit (hooks.server.ts)
export const handle = ({ event, resolve }) =>
  runtime.onInvoke(event.request, () => resolve(event));

// TanStack Start (request middleware)
createMiddleware({ type: 'request' }).server(({ request, next }) =>
  runtime.onInvoke(request, next),
);
```

The package will export these adapters, e.g. `flags/hono`, so users do not
write them. Frameworks without a middleware that wraps the handler need a
different way to find the current request. Nuxt 3 and 4 (Nitro 2 / h3 1) are
an example. For these, a later version can let the adapter give the runtime a
function that returns the current request, e.g. from the request context of
the framework. This must be checked for each framework.

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

Other items:

- Value types other than boolean.
- A configurable logger, e.g. to write debug messages or to send errors to a
  monitoring service.
- A context on the call side of a flag, e.g. `myFlag(context)`. Flags will
  accept it later. Until then, only `evaluate` accepts an explicit context.

## Open questions

- Add a timeout for the wait for an initialization? The LaunchDarkly provider
  waits up to 10 seconds by default.


