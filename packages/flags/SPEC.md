# Flags SDK v5 spec (draft)

Working notes for the next major version. Not published (`files` only includes `dist`).

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
6. OpenFeature parity. Provider hooks, events and tracking. Flag types other
   than boolean.
7. Tooling. Links to the flag in the dashboard of the platform (`origin`).
   Flag discovery for tools such as Flags Explorer. Overrides from cookies or
   headers, as an extension that reads only `FlagsRequest`.
8. Framework integrations. Small adapters for Hono, Express, SvelteKit,
   TanStack Start, Nuxt and Next.js call the `runtime` methods (see
   "Framework integrations"). Compiler plugins for the `'use flags'`
   directive call `registerFlags`.
9. Standard. Write the spec with normative words (MUST, SHOULD). Add a
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
- `getEvaluationContext(context, request)` is the last step of the
  evaluation context chain (see "Evaluation context chain").
- Several connections can share a provider. It is initialized once.

## Flags

`defineFlag({ key, defaultValue?, connection, getEvaluationContext? })` returns
an async function: `await myFlag()` or
`await myFlag({ evaluationContext })`. The function also exposes `key`,
`defaultValue`, `connection` and `getEvaluationContext`, so the project is
available from every flag.

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
- A link to the flag in the provider's dashboard (`origin`) will be added
  later.

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
  project: { platform: 'in-memory' },
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

- Inside a request, each step runs once for each input object. A second call
  with the same object, or without input, uses the first result.
  `evaluate([a, b], { evaluationContext })` gives the same object to each
  flag, so the step of a shared connection runs once.
- A new object is a new input, also with the same fields. The SDK does not
  compare the fields, because that is slow and not always correct.
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
- The request scope holds the cache of the evaluation context chain.
- A flag waits for the initialization of its provider. It gets the context at
  the same time.

### Framework integrations (planned)

Each integration is a small adapter. It gives the SDK what the framework can
give about the request (`FlagsRequestInit`), and uses the way to give it to
the runtime that fits the framework.

```ts
// Hono, SvelteKit, TanStack Start: a Web Request
app.use((c, next) => runtime.onInvoke(c.req.raw, next));
export const handle = ({ event, resolve }) =>
  runtime.onInvoke(event.request, () => resolve(event));

// Express: convert the Node.js headers into Web Headers
app.use((req, res, next) => runtime.onInvoke(toFlagsRequest(req), next));

// Next.js: no middleware wraps the rendering, but headers() returns the
// same object during one request
runtime.setRequestSource(async () => ({
  headers: await headers(),
  cookies: await cookies(),
}));
```

Next.js has two places with different requests: the proxy (`proxy.ts`) gets
the full `NextRequest`, but pages only get `headers()` and `cookies()`. Both
places can give `{ headers, cookies }`, and the proxy can also give `url`.

Frameworks that have their own request context can also use a source, e.g.
`getRequestEvent()` of SvelteKit or the request context of Nitro for Nuxt.
The details must be checked for each framework in milestone 8.

The package will export these adapters, e.g. `flags/hono`, so users do not
write them.

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

#### Self-registration

A module can register its own flags with a static self-import:

```ts
// flags.ts
import * as self from './flags';

export const a = defineFlag({ key: 'a', connection });
export const b = defineFlag({ key: 'b', connection });

registerFlags(self); // at the end of the module
```

- The call must be at the end of the module. Before, the exports are not
  initialized, and `registerFlags` throws a `ReferenceError`.
- This works in Node.js and after bundling (tested with esbuild).
- `registerSelf(import.meta.url)`, which imports the URL dynamically, is not
  part of the SDK:
  - After bundling, `import.meta.url` is the URL of the bundle file, not of
    the module. The import then returns the exports of the bundle (tested
    with esbuild: it found the export of the entry point instead of the
    flags).
  - With a top-level `await`, the module waits for itself: a deadlock.
  - CommonJS has no `import.meta.url`.
- A self-registration runs only when the module is imported. `defineFlag`
  already registers the connection at that time. Thus, the self-registration
  adds value for the `'use flags'` contract (each export is a flag) and for
  flag discovery, but not for modules which are imported lazily. For these,
  the build tooling must import the module at startup.

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

## Open questions

- Add a timeout for the wait for an initialization? The LaunchDarkly provider
  waits up to 10 seconds by default.


