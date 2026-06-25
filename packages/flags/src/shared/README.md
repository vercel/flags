# `shared/` — the framework-agnostic Flags core

This directory holds the parts of the Flags SDK that don't depend on a specific
framework. `flags/next` and `flags/sveltekit` are thin adapters over it, and a
new framework integration should be too.

> Named `shared` (not `core`) to avoid confusion with the separate
> `@vercel/flags-core` package.

## Modules

| Module | Responsibility |
|--------|----------------|
| `seal.ts` | `sealHeaders` / `sealCookies` (read-only adapters, memoized by headers identity) and `transformToHeaders` (Node `IncomingHttpHeaders` → `Headers`). |
| `overrides.ts` | `readOverrides(cookies, secret?)` — reads & decrypts the `vercel-flag-overrides` cookie (memoized). |
| `flag-meta.ts` | `resolveAdapter`, `getDecide` (with adapter validation), `getIdentify`, `getOrigin` — derive a flag's behavior from its declaration. |
| `evaluation.ts` | The per-request pipeline: the headers-keyed `evaluationCache` (+ `getUsedFlags`), `getEntities` (identify + dedupe), and `applyResult` (cache → override → produce → defaultValue/error → reportValue). |
| `evaluate.ts` | `evaluateFlags(...)` — the bulk path: partition flags by `(adapterId, identify)`, call `adapter.bulkDecide` once per group, run the rest standalone. Owns the `BULKABLE` / `BULK_IDENTIFY_REF` markers. |
| `precompute.ts` | `serialize` / `deserialize` / `combine` / `generatePermutations` / `readFlagValue` (signed value (de)serialization). |
| `discovery.ts` | `handleDiscoveryRequest(...)` — authorize → 401-or-data → set `x-flags-sdk-version`, for the well-known endpoint. |

## The contract a framework implements

Everything framework-specific reduces to **"given the invocation, produce the
request context"** plus output integration. Concretely a framework adapter:

1. **Resolves a request context** — sealed `headers` + `cookies` and a stable
   `dedupeCacheKey` (object identity used to key the per-request caches; use the
   request's `Headers` instance, or `IncomingHttpHeaders` for Node). All three
   feed `getEntities` / `applyResult` / `evaluateFlags`.

2. **Resolves the secret** — its own strategy (env var, framework config, …),
   passed to `readOverrides` and the precompute helpers.

3. **Wires `flag()`** — call `resolveAdapter` → `getDecide` / `getIdentify` /
   `getOrigin`, then on invocation: `readOverrides` → `getEntities` →
   `applyResult({ definition, readonlyHeaders, entitiesKey, overrides, produce,
   isFrameworkError })`. Stamp `BULKABLE` / `BULK_IDENTIFY_REF` (and `adapter`)
   on the returned function so it can participate in `evaluateFlags`.

4. **Provides `isFrameworkError`** — errors that must NOT be swallowed by the
   defaultValue fallback (e.g. Next's `redirect()` / `notFound()` control flow).
   Defaults to `() => false`.

5. **Invokes standalone flags for `evaluateFlags`** — `invokeStandalone`: Next
   calls `flagFn()` (reads ambient `next/headers`); SvelteKit calls
   `flagFn(request)`.

6. **Integrates output** — e.g. SvelteKit reads `getUsedFlags(sealHeaders(req.headers))`
   in `transformPageChunk` to inject evaluated values into the HTML; the
   discovery endpoint uses `handleDiscoveryRequest`.

`flags/next` (App Router via `next/headers`, Pages Router via the request, bulk
via an `AsyncLocalStorage`) and `flags/sveltekit` (its `handle` ALS or an
explicit `Request`) are the two reference implementations.
