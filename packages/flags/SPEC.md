# Flags SDK v5 spec (draft)

Working notes for the next major version. Not published (`files` only includes `dist`).

## Providers

A provider is any object structurally compatible with the OpenFeature server
`Provider` interface. The SDK does not depend on `@openfeature/*`; it declares
its own minimal types (`Provider`, `EvaluationContext`, `ResolutionDetails`,
`Logger`) which OpenFeature providers satisfy as-is.

The SDK calls providers directly instead of going through the OpenFeature
client, so it owns initialization, evaluation and shutdown.

### Provider extension

Capabilities beyond the OpenFeature spec live on an optional extension object
under `provider[Symbol.for('flags.provider-extension')]`. The SDK detects each
capability and falls back when it is missing.

```ts
interface ProviderExtension {
  /**
   * Called once per request. Lets the provider prepare work that later
   * evaluations in the same request reuse, e.g. making sure data is fresh.
   */
  onInvoke?(request: { headers: ReadonlyHeaders }): Promise<void> | void;

  /** Resolves several flags in a single call. */
  resolveBatch?(
    flags: { key: string; defaultValue?: boolean }[],
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>[]>;
}
```

Fallbacks: `onInvoke` is a no-op, and `resolveBatch` becomes one
`resolveBooleanEvaluation` call per flag.

## Projects

`defineProject(provider, options)` returns the same provider instance.

- `options.provider` is one of a fixed list of provider names. The name
  determines which other fields are required (`ProjectFieldsByProvider`), e.g.
  `launchdarkly` requires `projectId` and `teamId`.

- `provider`, `projectId` and `teamId` are merged into the existing
  `provider.metadata` via `Object.assign`, keeping `name`. Throws if the fields
  are not present afterwards (e.g. `metadata` is a getter returning a new
  object).
- `getEvaluationContext(request: { headers: ReadonlyHeaders })` is stored
  outside of `metadata`, keyed by provider. It is called once per request.

## Flags

`defineFlag({ key, defaultValue?, provider })` returns an async function:
`await myFlag()`.

- Boolean only for now. A `type` field will be added later.
- Evaluation context is empty until `getEvaluationContext` is wired up.
- Errors: a provider can throw, or return details with an `errorCode`. Both are
  treated the same: return `defaultValue` if set, otherwise throw.

### Evaluating several flags

`evaluate([flagA, flagB])` resolves several flags in one call, avoiding the
overhead of one promise chain per flag. The SDK groups the flags by provider
and calls `resolveBatch` once per provider when available. Results are returned
as a tuple matching the input order.

## Runtime lifecycle

The lifecycle maps to AWS Lambda phases.

- `registerProviders(providers)` is optional. It lets the runtime know about
  providers before the first request.
- `onInit` (Lambda init phase, outside any request): awaits `initialize()` of
  registered providers. Intended for local work like parsing an embedded
  fallback configuration. Failures are logged, not thrown.
- `onInvoke({ headers })` (inside the request handler): makes sure every known
  provider is initialized, retrying failed initializations, then calls each
  provider's `onInvoke` extension.
- Providers that were never registered are initialized lazily on their first
  evaluation.
- `onShutdown`: calls `onClose()` on every initialized provider.

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
