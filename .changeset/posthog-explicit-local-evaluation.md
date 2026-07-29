---
"@flags-sdk/posthog": major
---

Modernize the PostHog adapter. This release is breaking in five ways:

- **Environment variables were renamed.** `NEXT_PUBLIC_POSTHOG_KEY` → `POSTHOG_PROJECT_API_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` → `POSTHOG_HOST`.
- **Local vs. remote evaluation is now an explicit choice.** The default adapter evaluates remotely unless you set `POSTHOG_SECRET_KEY`.
- **The three adapter methods collapsed into a single callable adapter.** `isFeatureEnabled()` / `featureFlagValue()` / `featureFlagPayload()` become `postHogAdapter` and `postHogAdapter.payload`.
- **A flag's `key` is used as the PostHog flag key verbatim.** The old "read until the first `.`" convention is gone.
- **The per-call `sendFeatureFlagEvents` option and the `featureFlagPayload` `getValue` mapper are removed.**

It also upgrades `posthog-node` from v4.11.1 to v5.45.0 (which raises the required
Node.js version), adds bulk evaluation support, drops `posthog-node`'s runtime
deprecation warnings, and removes the unused `@vercel/edge-config` dependency.

This release requires `flags@^4.2.0`, which is where the uninvoked-adapter shorthand
and bulk evaluation landed.

## Environment variables

The adapter runs server-side only, so its credentials were never meant to be exposed
to the browser. The `NEXT_PUBLIC_` prefixed variables are renamed accordingly, and the
project API key variable now says which key it wants:

```diff
- NEXT_PUBLIC_POSTHOG_KEY=phc_...
- NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
+ POSTHOG_PROJECT_API_KEY=phc_...
+ POSTHOG_HOST=https://us.i.posthog.com
```

`POSTHOG_HOST` is also what `getProviderData` derives the app host from, and
`POSTHOG_PERSONAL_API_KEY` / `POSTHOG_PROJECT_ID` are unchanged.

## Explicit local vs. remote evaluation

Previously the default `postHogAdapter` passed `POSTHOG_PERSONAL_API_KEY` into the
runtime `posthog-node` client. When that variable was set, this enabled local
evaluation and started a feature-flag poller in every warm server process — on
serverless that could generate a large, traffic-independent volume of PostHog feature
flag requests, as a side effect of a credential you may only have set for the Flags
Explorer.

The default adapter now evaluates flags remotely unless you opt in to local
evaluation by setting `POSTHOG_SECRET_KEY` (a `phs_...` project secret key). When set,
`posthog-node` polls flag definitions and evaluates flags in-process. When using
`createPostHogAdapter`, control it explicitly via `postHogOptions`
(`secretKey` + `enableLocalEvaluation`).

`POSTHOG_PERSONAL_API_KEY` continues to be used only by `getProviderData` (Flags
Explorer discovery) and no longer affects runtime evaluation.

## Single callable adapter

The three adapter methods (`isFeatureEnabled`, `featureFlagValue`, `featureFlagPayload`)
are collapsed into a single callable adapter, matching `@flags-sdk/vercel`. Pass it
uninvoked or invoked, and use `.payload` for a flag's attached payload:

```ts
// before
import { postHogAdapter } from '@flags-sdk/posthog';

flag({ key: 'my-flag', adapter: postHogAdapter.isFeatureEnabled() });
flag({ key: 'my-flag', adapter: postHogAdapter.featureFlagValue() });
flag({ key: 'my-flag', adapter: postHogAdapter.featureFlagPayload((v) => v) });

// after
import { postHogAdapter } from '@flags-sdk/posthog';

flag({ key: 'my-flag', adapter: postHogAdapter }); // or postHogAdapter()
flag({ key: 'my-flag', adapter: postHogAdapter.payload }); // or .payload()
```

`isFeatureEnabled` and `featureFlagValue` merged into the value adapter, which returns
whatever PostHog evaluated the flag to: a boolean for a boolean flag, the variant
`string` for a multivariate flag. Type the flag (`flag<boolean>`, `flag<string>`) to
describe the value you expect.

Note that `isFeatureEnabled` used to coerce a multivariate flag's variant to `true`.
Nothing coerces now, so a flag that previously read `true` via `isFeatureEnabled` will
read e.g. `'variant-a'`. Declaring `flag<boolean>` only changes the TypeScript type —
if you relied on the boolean, narrow the value in your own `decide` or at the call site.

A flag's `key` is now used as the PostHog feature flag key verbatim. The previous
convention of trimming everything after the first `.` (so `my-flag.variant` read the
PostHog flag `my-flag`) has been removed; use the exact PostHog flag key as your flag
`key`.

## Upgraded `posthog-node`, migrated to `evaluateFlags`, added bulk evaluation

`posthog-node` is upgraded from v4.11.1 to v5.45.0. Internally the adapter now uses its
`evaluateFlags` instead of the deprecated `isFeatureEnabled` / `getFeatureFlag` /
`getFeatureFlagPayload` methods, removing the deprecation warnings those log at runtime.

The adapter also implements `bulkDecide`, so
[`evaluate()`](https://flags-sdk.dev/frameworks/next/bulk-evaluation) resolves flags
that share an `identify` source through a single `evaluateFlags` call — one `/flags`
request when evaluating remotely, one in-process evaluation when evaluating locally.
Flag values and flag payloads are batched separately, so a flag and its payload still
resolve through two calls.

The per-call `sendFeatureFlagEvents` option and the `featureFlagPayload` `getValue`
mapper are removed (neither has an `evaluateFlags` equivalent); map payloads in your
own flag code instead.

## Node.js version requirement

`posthog-node@5.45.0` requires Node.js `^20.20.0 || >=22.22.0`, and this adapter now
declares the same `engines` constraint.

## Removed `@vercel/edge-config` dependency

The adapter never used it. It is dropped from `dependencies` (and from the package
keywords), so installs no longer pull it in.
