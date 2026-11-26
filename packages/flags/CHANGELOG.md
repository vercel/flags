# @vercel/flags

## 4.5.3

### Patch Changes

- [#645](https://github.com/vercel/flags/pull/645) [`7905c9b`](https://github.com/vercel/flags/commit/7905c9b91ffb01cf897806180d61a5871cc962fe) Thanks [@dferber90](https://github.com/dferber90)! - Recheck the expiration of cached encrypted flag overrides on every use, and include the active secret in the cache identity so tokens stop working after expiration or secret rotation.

## 4.5.2

### Patch Changes

- [#631](https://github.com/vercel/flags/pull/631) [`a9261aa`](https://github.com/vercel/flags/commit/a9261aa810297a8ca18b58722530b3ea57fcdabb) Thanks [@dferber90](https://github.com/dferber90)! - `flags/next`: a flag inside a cache scope, e.g. `"use cache"` or `unstable_cache()`, now fails with a clear error: "A flag can not be evaluated inside a cache scope … Evaluate the flag outside of the cached function, and pass the value in as an argument." The error of Next.js is its `cause`. Before, it failed with the error of `headers()`. The SDK also uses `unstable_rethrow` of Next.js to recognize the internal errors of Next.js, e.g. of `redirect()`, which it must throw again. The peer dependency on `next` is now `>=15.0.0`, the first version with `unstable_rethrow`. Next.js 14 is out of support.

## 4.5.1

### Patch Changes

- [#608](https://github.com/vercel/flags/pull/608) [`e8d792f`](https://github.com/vercel/flags/commit/e8d792f2e1814430ff0dc24bbf8d93b5f3bf955d) Thanks [@reginaldalfret](https://github.com/reginaldalfret), [@dferber90](https://github.com/dferber90)! - Serialization of a flag with 252 or more options is now correct. Before this fix, option indices 252 to 255 were read back as `null`, `false`, `true`, or an unlisted value, and indices of 256 or more were truncated. These options now use the unlisted-value path, so their values are kept.

## 4.5.0

### Minor Changes

- [#586](https://github.com/vercel/flags/pull/586) [`3cc264b`](https://github.com/vercel/flags/commit/3cc264ba96b6005206fc1af3f06e9ddedb08841d) Thanks [@luismeyer](https://github.com/luismeyer)! - `encryptFlagValues` encrypts with the public key of Vercel when there is no `FLAGS_SECRET`, instead of throwing. In SvelteKit, `createHandle` and `encryptFlagValues` work without `FLAGS_SECRET` too: the flag values of a page are encrypted with the public key.
  
  This fallback is silent. Before, a secret which is `undefined` or empty (e.g. `encryptFlagValues(values, process.env.TYPO)`) threw an error. Now the values are encrypted with the public key, and `decryptFlagValues` can not read them, because only Vercel can decrypt them: it logs a warning and returns `undefined`.
  
  `decryptFlagValues`, `encryptFlagDefinitions` and `decryptFlagDefinitions` keep working only with a `FLAGS_SECRET`.
  
  The project of the host is also read from the OIDC token of the request (`x-vercel-oidc-token`), so a deployment which does not expose the system environment variables works too.

- [#589](https://github.com/vercel/flags/pull/589) [`e248a06`](https://github.com/vercel/flags/commit/e248a06422e0b183331f3ce4b699187163b6479a) Thanks [@luismeyer](https://github.com/luismeyer)! - `verifyAccess` accepts short-lived tokens which Vercel signs with Vercel KMS, so the Flags Discovery Endpoint (`/.well-known/vercel/flags`) works on Vercel without a `FLAGS_SECRET`. These tokens are signed by a separate Vercel KMS issuer, not the issuer of signed overrides.
  
  Proofs encrypted with the `FLAGS_SECRET` keep working exactly as before. Without a secret, `verifyAccess` now returns `false` for such a proof instead of throwing.
  
  When there is no secret and the host can not verify signed tokens (a self-hosted app, local development without `vercel env pull`, or a project which does not expose the system environment variables), `verifyAccess` logs a warning which names the fix.

- [#587](https://github.com/vercel/flags/pull/587) [`3b5d8ec`](https://github.com/vercel/flags/commit/3b5d8ec1e0055a2e6669fa4466a9e929db6dd5c6) Thanks [@luismeyer](https://github.com/luismeyer)! - Accept flag overrides which the Vercel Toolbar signs with Vercel KMS, so overrides work on Vercel without a `FLAGS_SECRET`.
  
  On Vercel, or locally after `vercel env pull`, the SDK verifies signed override tokens with the public keys of Vercel, which it keeps in memory. `decryptOverrides` accepts them too, for apps which read the cookie themselves. Tokens encrypted with the `FLAGS_SECRET` keep working exactly as before. The cookie is still `vercel-flag-overrides`.
  
  The host must know that it runs for a Vercel project. On Vercel, it reads the project from the [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables) (`VERCEL`, `VERCEL_PROJECT_ID`), or from the OIDC token of the request (`x-vercel-oidc-token`). With that token, a deployment also checks the team of a signed token. Locally, `vercel env pull` supplies the `VERCEL_OIDC_TOKEN`. SvelteKit also reads it from `$env` during `vite dev`.
  
  A signed token which the host can not use is ignored, with a warning which names the cause: the host can not verify signed tokens, the public keys do not load, or the token is for a different project or environment.
  
  Without a `FLAGS_SECRET`, a Next.js flag now ignores an overrides cookie which the host can not read (e.g. an encrypted cookie from before the secret was removed). Before, it threw `flags: Missing FLAGS_SECRET`.
  
  Add `signOverrides`, which asks Vercel to sign flag overrides for the project and the environment of the host, e.g. for end-to-end tests of a project without a `FLAGS_SECRET`. It uses the OIDC token of the host: of the request on a deployment, or the `VERCEL_OIDC_TOKEN` of `vercel env pull`.

- [#597](https://github.com/vercel/flags/pull/597) [`0d8720f`](https://github.com/vercel/flags/commit/0d8720f57a72e79ea6c6ecfce099899601dffd72) Thanks [@luismeyer](https://github.com/luismeyer)! - Precompute works on Vercel without a `FLAGS_SECRET`. When there is no secret, `precompute`, `serialize`, `deserialize`, `getPrecomputed` and `generatePermutations` (Next.js and SvelteKit) sign the code with a key derived from `VERCEL_DEPLOYMENT_KEY`, which Vercel sets for the build and for the runtime of a deployment.
  
  Each deployment has its own key, so a code is only valid inside the deployment which created it. Set `FLAGS_SECRET` or `FLAGS_PRECOMPUTE_SECRET`, or pass a secret, if a code must be valid in another deployment or project.
  
  The new variable `FLAGS_PRECOMPUTE_SECRET` sets a secret for precompute only. It is only used when there is no `FLAGS_SECRET`. The order is: a secret passed to the function, `FLAGS_SECRET`, `FLAGS_PRECOMPUTE_SECRET`, the key of the deployment, the public secret outside of Vercel. In SvelteKit, pass the same secret to `createHandle`, `precompute` and `generatePermutations`, or none to all of them.
  
  In the local development of a Vercel project (e.g. `next dev` or a local `next build && next start` after `vercel env pull`, which writes a `VERCEL_OIDC_TOKEN` for the environment `development`), these functions use a fixed, public secret when there is no other one. Anyone can create a code with it, so they warn one time when `NODE_ENV` is not `development`. Without such a token, e.g. on a custom host, they throw without a secret, as before.
  
  In a Turborepo task, a cache hit replays codes of another deployment, because `VERCEL_DEPLOYMENT_KEY` is not part of the hash of the task. Add `VERCEL_DEPLOYMENT_KEY` to the `env` of the task in `turbo.json`, or set `FLAGS_PRECOMPUTE_SECRET`.
  
  On Vercel without a secret and without `VERCEL_DEPLOYMENT_KEY` (a project which does not expose the system environment variables, or a build with `vercel build` which is deployed with `vercel deploy --prebuilt`), these functions throw as before.

### Patch Changes

- [#586](https://github.com/vercel/flags/pull/586) [`3cc264b`](https://github.com/vercel/flags/commit/3cc264ba96b6005206fc1af3f06e9ddedb08841d) Thanks [@luismeyer](https://github.com/luismeyer)! - Without a `FLAGS_SECRET`, `encryptFlagValues` no longer throws when the public key of Vercel does not load (e.g. the key host is down, or a request times out). It logs a warning, at most one time in 30 seconds, and returns an empty string, so the build or the render does not fail. The flag values are only for the Vercel Toolbar: the page has none until it renders again.
  
  `FlagValues` of `flags/react` renders nothing for an empty string. If you render the `script` tag with `data-flag-values` yourself, leave it out when the value is empty. In SvelteKit, `createHandle` already rendered the page without the flag values; `encryptFlagValues` of `flags/sveltekit` now returns an empty string too.
  
  `encryptFlagValues` still throws when there is neither a secret nor a project ID, when the project ID is too long, and when the secret is not valid. With a secret nothing changes.

## 4.4.1

### Patch Changes

- [#592](https://github.com/vercel/flags/pull/592) [`9c5de4b`](https://github.com/vercel/flags/commit/9c5de4b87b22d7ffc22545dde51913d661b0b651) Thanks [@luismeyer](https://github.com/luismeyer)! - `deserialize` and `getPrecomputed` now throw when a precompute code does not match the requested flags group, such as an empty-group code paired with a non-empty group (or the other way around). The `__no_flags__` sentinel is now only accepted when deserializing an empty flags array.

## 4.4.0

### Minor Changes

- [#570](https://github.com/vercel/flags/pull/570) [`c03fba8`](https://github.com/vercel/flags/commit/c03fba8c033bba8d7c9d54de3a94c2d20e38a257) Thanks [@kakadiadarpan](https://github.com/kakadiadarpan)! - Emit OpenTelemetry spans from the SvelteKit adapter when a tracer provider is set.

## 4.3.1

### Patch Changes

- [#486](https://github.com/vercel/flags/pull/486) [`c9d2811`](https://github.com/vercel/flags/commit/c9d28116ebca661f4e3c73f301d4b2d35310c823) Thanks [@dferber90](https://github.com/dferber90)! - Add the `experimental_reportOverride` adapter hook for observing values set by
  the Flags SDK override cookie.
  
  This API is not supported for general use yet. Do not use it unless Vercel has
  explicitly enabled it for you.

## 4.3.0

### Minor Changes

- [#452](https://github.com/vercel/flags/pull/452) [`58e1f5b`](https://github.com/vercel/flags/commit/58e1f5bcdf0dd3ef44ce689681882792b31851c4) Thanks [@luismeyer](https://github.com/luismeyer)! - Replace `@vercel/edge-config` with `@vercel/global-config`.

  Rename the Edge Config adapter package to `@flags-sdk/global-config` and rename repository-owned Edge Config files, exports, types, options, variables, and environment variables to Global Config.

  The previous Edge Config names remain available as deprecated aliases, and the previous environment variables are still honored as fallbacks, so existing code keeps working without changes.

## 4.2.4

### Patch Changes

- [#454](https://github.com/vercel/flags/pull/454) [`dcb74ff`](https://github.com/vercel/flags/commit/dcb74ff9389f93f6d808c674c855ee2e805b4402) Thanks [@dferber90](https://github.com/dferber90)! - return cache-control: no-store from flags discovery endpoint

## 4.2.3

### Patch Changes

- [#442](https://github.com/vercel/flags/pull/442) [`622d56e`](https://github.com/vercel/flags/commit/622d56e608f091a8fbfbda0ee076ea3dcf808e52) Thanks [@dferber90](https://github.com/dferber90)! - Remove `@sveltejs/kit` from peer dependencies. It was declared as an optional peer with a `"*"` range, which caused npm to auto-install the newest `@sveltejs/kit` and drag in its transitive `@sveltejs/vite-plugin-svelte` → `vite` peer chain. In non-SvelteKit projects already on Vite 7 (via Vitest, Storybook, etc.) this produced a hard `ERESOLVE` error requiring `npm install --force`. SvelteKit consumers always have `@sveltejs/kit` installed as the framework, so the `flags/sveltekit` entrypoint continues to resolve it from their own tree.

## 4.2.2

### Patch Changes

- [#438](https://github.com/vercel/flags/pull/438) [`d23d9d2`](https://github.com/vercel/flags/commit/d23d9d2b7ab04bb72c8682c0811f20dd6699104f) Thanks [@eps1lon](https://github.com/eps1lon)! - Tracing no longer records Next.js control-flow errors as span errors. Redirects, notFound, and the rejected hanging promises of aborted prerenders (`HANGING_PROMISE_REJECTION`) are re-thrown for the framework to handle, but the flag evaluation span previously reported them via `span.setStatus({ code: 2, message })`, polluting traces with errors like "During prerendering, `connection()` rejects when the prerender is complete" on every aborted runtime prefetch. These spans are now reported as successful (status Ok), since the traced function completed as intended and the error is framework control flow, while genuine evaluation failures keep marking spans as errored.

## 4.2.1

### Patch Changes

- [#434](https://github.com/vercel/flags/pull/434) [`4d6eb10`](https://github.com/vercel/flags/commit/4d6eb10705ab5aa97baac2fc6f50b85a84c4368a) Thanks [@dferber90](https://github.com/dferber90)! - Allow passing a `NextRequest` / Web `Request` directly to `flag(req)` and `evaluate(flags, req)` outside App Router (e.g. in routing middleware).

  Previously only a Pages Router `IncomingMessage`, or a manually-flattened headers object, worked when calling a flag directly — passing a `NextRequest` produced empty headers because it wasn't recognized as already having a `Headers` instance.

## 4.2.0

### Minor Changes

- [#402](https://github.com/vercel/flags/pull/402) [`2cb0b49`](https://github.com/vercel/flags/commit/2cb0b49698019779859181f7825b0956bf7e629a) Thanks [@dferber90](https://github.com/dferber90)! - Allow passing an adapter factory directly to `flag()`

  You can now pass an adapter factory by reference instead of calling it:

  ```ts
  import { vercelAdapter } from "@flags-sdk/vercel";

  // before (still supported)
  flag({ key: "example", adapter: vercelAdapter() });

  // now also works
  flag({ key: "example", adapter: vercelAdapter });
  ```

  `flag()` resolves the factory once per declaration. Passing an already-constructed
  adapter instance continues to work unchanged. Applies to both the Next.js and
  SvelteKit entrypoints.

## 4.1.1

### Patch Changes

- [#399](https://github.com/vercel/flags/pull/399) [`50725a8`](https://github.com/vercel/flags/commit/50725a8dcfaca7b31d89c45c70e3e087366649da) Thanks [@dferber90](https://github.com/dferber90)! - Recognize hanging promise rejection as internal Next.js error

## 4.1.0

### Minor Changes

- [#385](https://github.com/vercel/flags/pull/385) [`201f9d5`](https://github.com/vercel/flags/commit/201f9d5988d7fc307511e35638e66769d38cedb3) Thanks [@dferber90](https://github.com/dferber90)! - When applications call `evaluate()` or `precompute()` function from `flags/next` it now defers bulk evaluation to the underlying adapters in case those support it, or otherwise falls back to evaluating each flag individually.

  This speeds up evaluation for applications that need to evaluate multiple flags at once, as the runtime needs to handle fewer promises and more work is reused. In testing we have seen a 20x improvement when called with 100 flags.

  ```tsx
  import { evaluate } from "flags/next";
  import { flagA, flagB } from "../flags";

  // pass a list of flags
  const [valueA, valueB] = await evaluate([flagA, flagB]);

  // pass an object
  const { a, b } = await evaluate({ a: flagA, b: flagB });
  ```

  Adapters can opt into bulk evaluation by implementing a `bulkDecide` method and setting a stable `adapterId`. When both are present, flag evaluation groups flags that share the same `adapterId` and `identify` source and invokes `bulkDecide` once per group instead of calling `decide` per flag. Flags without a bulk-capable adapter still resolve through the normal per-flag path inside `evaluate()` and still benefit from now reusing the shared per-request headers, cookies, and overrides reads.

  Tracing reflects this grouping. `evaluate()` (and therefore `precompute()`) now emits an `evaluate` span carrying a `flagCount` attribute. Within it, bulk-evaluated flags no longer emit an individual per-flag `run` span; instead each adapter group emits a single `batch` span (carrying the `adapterId`, the `keys` evaluated in the batch, and `cachedCount`/`overrideCount`/`decidedCount` attributes summarizing how the batch resolved) so per-flag instrumentation overhead is not reintroduced. Flags that fall back to the per-flag path continue to emit their own `flag` span as before.

## 4.0.6

### Patch Changes

- c08f3e5: Improve performance by caching `next/headers` imports.

  Previously every flag evaluation in Next.js App Router would run
  `await import("next/headers")`. The imported module is cached by
  the runtime, but we would still go through the event loop unnecessarily.

  Now we cache the resolved module in a local variable so only the
  first call awaits the dynamic import; subsequent calls skip the
  microtask entirely.

- c08f3e5: Reduce microtask queue overhead in flag evaluation by replacing the async IIFE around `decide()` with a direct call and `Promise.resolve()`.

## 4.0.5

### Patch Changes

- dd1396e: Guard internal flag hooks when Vercel does not expose the expected runtime helpers during evaluation.

## 4.0.4

### Patch Changes

- 77727aa: The Flags SDK now handles when an app goes from precomputing one or more flags to precomputing none.

  In this case we use `__no_flags__` as the serialized value so the app will still rewrite and prerender the page.

  `precompute`, `generatePermutations`, `serialize` and `deserialize` were adjusted to generate and parse `__no_flags__` correctly.

## 4.0.3

### Patch Changes

- 795dfd4: Throw on declaration if flag is missing decide function.

  When a feature flag is declared without a decide function, or with an adapter that is missing a decide function we will now throw an error at declaration time.

## 4.0.2

### Patch Changes

- 5f3757a: drop tsconfig dependency

## 4.0.1

### Patch Changes

- d4108c8: - expose `clearDedupeCacheForCurrentRequest` to allow clearing the cache of a deduped function for the current request

## 4.0.0

### Major Changes

- bc7944e: **BREAKING CHANGES** The general purpose `encrypt` and `decrypt` functions were replaced by dedicated functions, and it is now required to return version information from the flags discovery endpoint. See the [Upgrade Guide](https://github.com/vercel/flags/blob/main/packages/flags/guides/upgrade-to-v4.md) for upgrade instructions.

### Minor Changes

- bc7944e: Add `createFlagsDiscoveryEndpoint` helper functions when creating the `/.well-known/vercel/flags` endpoint for Next.js App Router and SvelteKit.

## 3.2.0

### Minor Changes

- 701f3c2: feat: provide precompute patterns for SvelteKit

## 3.1.2

### Patch Changes

- b79a84a: Pass the `defaultValue` to the adapter's decide function

## 3.1.1

### Patch Changes

- 6955b68: emit reduced console info when falling back to defaultValue during development
- cf532da: Update package.json and tsup.config.js for flags package

## 3.1.0

### Minor Changes

- 76feb16: Add `mergeProviderData` function to `@vercel/flags`.

  This function allows merging ProviderData from multiple sources.

  This is handy when you declare feature flags in code, and want to extend those definitions with data loaded from your feature flag provider.

  ```ts
  import { verifyAccess, mergeProviderData, type ApiData } from "@vercel/flags";
  import { getProviderData } from "@vercel/flags/next";
  import { NextResponse, type NextRequest } from "next/server";
  import { getProviderData as getStatsigProviderData } from "@flags-sdk/statsig";
  import * as flagsA from "../../../../flags-a"; // your feature flags file(s)
  import * as flagsB from "../../../../flags-b"; // your feature flags file(s)

  export async function GET(request: NextRequest) {
    const access = await verifyAccess(request.headers.get("Authorization"));
    if (!access) return NextResponse.json(null, { status: 401 });

    const providerData = await mergeProviderData([
      // expose flags declared in code first
      getProviderData({ ...flagsA, ...flagsB }),
      // then enhance them with metadata from your flag provider
      getStatsigProviderData({ consoleApiKey: "", projectId: "" }),
    ]);

    return NextResponse.json<ApiData>(providerData);
  }
  ```

### Patch Changes

- 2713ea7: Handle `undefined` values

  - fix: Fall back to `defaultValue` when a feature flag returns `undefined`
  - fix: Throw error when a flag resolves to `undefined` and no `defaultValue` is present

  The value `undefined` can not be serialized so feature flags should never resolve to `undefined`. Use `null` instead.

  Fix exports

  - fix: Export `Identify` and `Decide` types

## 3.0.2

### Patch Changes

- 708d5e2: generatePermutations: infer options of boolean flags

## 3.0.1

### Patch Changes

- 7e21d4f: add metadata to package.json

## 3.0.0

### Major Changes

- db89f0d: - **BREAKING CHANGE** removed all `unstable_` prefixes, e.g. `unstable_flag` is now `flag`

  - **BREAKING CHANGE** removed `getPrecomputationContext`, use `dedupe` instead (see below)
  - **BREAKING CHANGE** moved all provider functions to dedicated packages
    - `@vercel/flags/providers/launchdarkly` → `@flags-sdk/launchdarkly`
    - `@vercel/flags/providers/statsig` → `@flags-sdk/statsig`
    - `@vercel/flags/providers/split` → `@flags-sdk/split`
    - `@vercel/flags/providers/hypertune` → `@flags-sdk/hypertune`
    - `@vercel/flags/providers/optimizely` → `@flags-sdk/optimizely`
    - `@vercel/flags/providers/happykit` → `@flags-sdk/happykit`
  - **BREAKING CHANGE** changed `.run({})` behavior

  See [flags-sdk.com](https://flags-sdk.com/) for the latest APIs.

- db89f0d: remove unstable\_ prefixes

### Minor Changes

- db89f0d: **@vercel/flags/next: Added a `dedupe` function**

  `dedupe` is a middleware-friendly version of `React.cache`. It allows ensuring a function only ever runs once per request.

  ```ts
  import { dedupe } from "@vercel/flags/next";

  let i = 0;
  const runOnce = dedupe(async () => {
    return i++;
  });

  await runOnce(); // returns 0
  await runOnce(); // still returns 0
  ```

  This function is useful when you want to deduplicate work within each feature flag's `decide` function. For example if multiple flags need to check auth you can dedupe the auth function so it only runs once per request.

  `dedupe` is also useful to optimistically generate a random visitor id to be set in a cookie, while also allowing each feature flag to access the id. You can call a dedupe'd function to generate the random id within your Edge Middleware and also within your feature flag's `decide` functions. The function will return a consistent id.

  ```ts
  import { nanoid } from "nanoid";
  import { cookies, headers } from "next/headers";
  import { dedupe } from "@vercel/flags/next";

  /**
   * Reads the visitor id from a cookie or returns a new visitor id
   */
  export const getOrGenerateVisitorId = dedupe(
    async (): Promise<{ value: string; fresh: boolean }> => {
      const visitorIdCookie = (await cookies()).get("visitor-id")?.value;

      return visitorIdCookie
        ? { value: visitorIdCookie, fresh: false }
        : { value: nanoid(), fresh: true };
    }
  );
  ```

  > Note: "once per request" is an imprecise description. A `dedupe`d function actually runs once per request, per compute instance. If a dedupe'd function is used in Edge Middleware and in a React Server Component it will run twice, as there are two separate compute instances handling this request.

  > Note: This function acts as a sort of polyfill until similar functionality lands in Next.js directly.

## 2.7.0

### Minor Changes

- fb50709: Adds support for using feature flags in Pages Router.

  The same feature flag declared for App Router can now also be used in Pages Router. Feature flags need to be used server-side.

  Note that your implementation of the actual feature flag needs to be compatible with Pages Router if you plan on using it inside of Pages Router. This means you can not call functions like `headers()` and `cookies()` which are not available in Pages Router. You can instead rely on the `headers` and `cookies` arguments passed to your `decide` function as `decide({ headers, cookies })`.

  **Dynamic usage example**

  ```ts
  export async function getServerSideProps({ req }) {
    const showFreeDeliveryBanner = await showFreeDeliveryBannerFlag(req);
    return { props: { showFreeDeliveryBanner } };
  }
  ```

  **Precomputed usage example**

  ```ts
  import { bannerFlags, showFreeDeliveryBannerFlag } from "./flags";
  import type {
    GetStaticPaths,
    GetStaticProps,
    InferGetStaticPropsType,
  } from "next";
  import { unstable_generatePermutations as generatePermutations } from "@vercel/flags/next";

  export const getStaticPaths = (async () => {
    const codes = await generatePermutations(bannerFlags);

    return {
      paths: codes.map((code) => ({ params: { code } })),
      fallback: "blocking",
    };
  }) satisfies GetStaticPaths;

  export const getStaticProps = (async (context) => {
    const showFreeDeliveryBanner = await showFreeDeliveryBannerFlag(
      context.params!.code as string,
      bannerFlags
    );

    return { props: { showFreeDeliveryBanner } };
  }) satisfies GetStaticProps<{ showFreeDeliveryBanner: boolean }>;
  ```

- 87503b6: Return `createdAt` and `updatedAt` as part of the provider data for those that support it

## 2.6.3

### Patch Changes

- 69f8df0: use defaultValue when an async decide function throws
- 65d3d73: add MIT license

## 2.6.2

### Patch Changes

- 80e0737: Add Next.js 15 compatibility.

  Uses the async versions of `headers` and `cookies` to avoid warnings during development.

## 2.6.1

### Patch Changes

- 9c379a8: add pagination to LaunchDarkly provider

## 2.6.0

### Minor Changes

- 7b9aa17: evaluate flags once per request only by reusing the result
- b049c26: add SvelteKit support

### Patch Changes

- c12f4d4: Deprecates `FlagsReporter` and `injectFlags`.

  Web Analytics now automatically detects flags present in the DOM, so these are no longer necessary.

  You can safely remove `FlagsReporter` and any calls to `injectFlags`.

- 1be4799: add no-store to LaunchDarkly provider

## 2.5.1

### Patch Changes

- 3a68cf7: Simplify middleware usage

  BREAKING CHANGE: `unstable_precompute` now returns code directly

  **Before**

  ```ts
  const values = await unstable_precompute(precomputeFlags, context);
  const code = await unstable_serialize(precomputeFlags, values);
  ```

  **After**

  This can now be done in a single function call.

  ```ts
  const code = await unstable_precompute(precomputeFlags, context);
  ```

  **Other notes**

  `unstable_precompute` conceptually calls `unstable_evaluate` and `unstable_serialize` to generate the code.

  This can also be done manually if you need access to `values`:

  ```ts
  const values = await unstable_evaluate(precomputeFlags, context);
  const code = await unstable_serialize(precomputeFlags, values);
  ```

  It's also possible to get the value of a specific flag in middleware based on the precomputation:

  ```ts
  // flags.ts
  export const showBanner = flag({
    /* ... */
  });
  export const precomputeFlags = [showBanner /* ... */];

  // middleware.ts
  const code = await unstable_precompute(precomputeFlags, context);
  const banner = showBanner(code, precomputeFlags);
  ```

## 2.5.0

### Minor Changes

- 1003c29: add experimental `@vercel/flags/next` pattern [for working with feature flags in Next.js](https://vercel.com/docs/workflow-collaboration/feature-flags/flags-pattern-nextjs)

## 2.4.0

### Minor Changes

- c132300: Add `reportValue` function to report resolved flags
- 5911721: add HappyKit provider
- bf47adb: Provide a the `unstable_getFlagsProps` and `unstable_setGlobalFlagsAnalyticsKeys` functions that can be used to integrate with Vercel Analytics

## 2.3.0

### Minor Changes

- be714bd: add hypertune provider

## 2.2.1

### Patch Changes

- 6f401cc: update README

## 2.2.0

### Minor Changes

- a6883ad: Add Optimizely provider
- af787a9: Include Experiments from Statsig in `getStatsigData`

### Patch Changes

- ae3f59c: Fix pagination for Statsig provider in `getStatsigData`

## 2.1.2

### Patch Changes

- b22ab52: support undefined as authHeader in verifyAccess for Pages Router compatibility
- 155d5ac: make overrideEncryptionMode optional in ApiData type

## 2.1.1

### Patch Changes

- 6b79659: expose ApiData type

## 2.1.0

### Minor Changes

- abae5af: Add verifyAccess to allow skipping encryption on the .well-known/vercel/flags endpoint

## 2.0.0

### Major Changes

- 59befe1: Unify `encrypt` and `decrypt` functions

  BREAKING CHANGE
  Replace the existing calls to any encrypt* or decrypt* functions like `encryptApiData`, `encryptOverrides`, `encryptValues` or `decryptApiData`, `decryptOverrides`, `decryptValues` with `encrypt` or `decrypt`

## 1.1.2

### Patch Changes

- 9ff283b: Fix auto-import showing `@vercel/flags/*` as option

## 1.1.1

### Patch Changes

- 80a1acc: Fix type export for providers

## 1.1.0

### Minor Changes

- 1f4fb18: Add Statsig and Split providers and update exports in package.json

## 1.0.0

### Major Changes

- c1e29ea: BREAKING CHANGE: `VERCEL_FLAGS_SECRET` env var has been renamed to `FLAGS_SECRET`
  - Rename your `VERCEL_FLAGS_SECRET` environment variable to `FLAGS_SECRET` in your project settings on vercel.com
  - Pull down the latest environment variables using `vercel env pull .env.local`

## 0.2.1

### Patch Changes

- 794b711: prevent xss

## 0.2.0

### Minor Changes

- 11a4bb6: add LaunchDarkly provider

## 0.1.9

### Patch Changes

- 1808b9c: fix auto-import in vs code defaulting to wrong path

## 0.1.8

### Patch Changes

- 91f801d: add JSDoc to `FlagDefinitionsType`, `FlagValuesType` and `FlagOverridesType`

## 0.1.7

### Patch Changes

- 1dbfd2c: add jsdoc to origin

## 0.1.6

### Patch Changes

- fa6a6d1: rename types to end with \*Types to avoid clash with component names

## 0.1.5

### Patch Changes

- 0e97393: omit src folder from package

## 0.1.4

### Patch Changes

- fe169df: change README wording

## 0.1.3

### Patch Changes

- effd1f6: replace url with origin in FlagDefinition type

## 0.1.2

### Patch Changes

- a4ee199: add main export
- 1a97981: rename data-variant-values to data-variant-state

## 0.1.1

### Patch Changes

- 446f640: rename types
- c1d2bee: fix return value of decryptOverrides
