# Flags SDK v5 spec (draft)

Working notes for the next major version. Not published (`files` only includes `dist`).

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

The lifecycle maps to AWS Lambda phases.

- `registerConnections(connections)` is optional. It lets the runtime know
  about connections before the first request.
- `onInit` (Lambda init phase, outside any request): awaits `initialize()` of
  the providers of registered connections. Intended for local work like parsing an embedded
  fallback configuration. Failures are logged, not thrown.
- `onInvoke({ headers })` (inside the request handler): makes sure every known
  provider is initialized, retrying failed initializations, then calls each
  provider's `onInvoke` extension.
- Providers of connections that were never registered are initialized lazily
  on their first evaluation.
- `onShutdown`: calls `onClose()` on every initialized provider.

### Build tooling (planned)

Modules starting with a `'use flags'` directive export only flags. Framework
compiler plugins will make sure their connections are registered before
startup, so nobody has to call `registerConnections` by hand. Two options:

- At build time, import these modules, read the `connection` of each export and
  generate the registration code.
- Preferred: inject a self-import into each such module, so the module can read
  its own exports and pass their connections to `registerConnections`.

Until then, `registerConnections` is called manually.

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
- Passing the current request to `getEvaluationContext` (needs
  `AsyncLocalStorage`).

## Open questions

- Does `evaluate([...], context)` take an explicit evaluation context, and does
  it replace or merge with the one from `getEvaluationContext`?
- If one flag in `evaluate` fails and has no `defaultValue`, does the whole call
  reject (like `Promise.all`), or does only that entry fail?
- Should `Runtime.onInvoke` wait for the provider's `onInvoke` extension, or
  start it and let the first evaluation in that request wait for it? The
  second lets the request handler do other work in the meantime.
