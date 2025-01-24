# @vercel/flags

## 3.1.0

### Minor Changes

- 76feb16: Add `mergeProviderData` function to `@vercel/flags`.

  This function allows merging ProviderData from multiple sources.

  This is handy when you declare feature flags in code, and want to extend those definitions with data loaded from your feature flag provider.

  ```ts
  import { verifyAccess, mergeProviderData, type ApiData } from '@vercel/flags';
  import { getProviderData } from '@vercel/flags/next';
  import { NextResponse, type NextRequest } from 'next/server';
  import { getProviderData as getStatsigProviderData } from '@flags-sdk/statsig';
  import * as flagsA from '../../../../flags-a'; // your feature flags file(s)
  import * as flagsB from '../../../../flags-b'; // your feature flags file(s)

  export async function GET(request: NextRequest) {
    const access = await verifyAccess(request.headers.get('Authorization'));
    if (!access) return NextResponse.json(null, { status: 401 });

    const providerData = await mergeProviderData([
      // expose flags declared in code first
      getProviderData({ ...flagsA, ...flagsB }),
      // then enhance them with metadata from your flag provider
      getStatsigProviderData({ consoleApiKey: '', projectId: '' }),
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
  import { dedupe } from '@vercel/flags/next';

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
  import { nanoid } from 'nanoid';
  import { cookies, headers } from 'next/headers';
  import { dedupe } from '@vercel/flags/next';

  /**
   * Reads the visitor id from a cookie or returns a new visitor id
   */
  export const getOrGenerateVisitorId = dedupe(
    async (): Promise<{ value: string; fresh: boolean }> => {
      const visitorIdCookie = (await cookies()).get('visitor-id')?.value;

      return visitorIdCookie
        ? { value: visitorIdCookie, fresh: false }
        : { value: nanoid(), fresh: true };
    },
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
  import { bannerFlags, showFreeDeliveryBannerFlag } from './flags';
  import type {
    GetStaticPaths,
    GetStaticProps,
    InferGetStaticPropsType,
  } from 'next';
  import { unstable_generatePermutations as generatePermutations } from '@vercel/flags/next';

  export const getStaticPaths = (async () => {
    const codes = await generatePermutations(bannerFlags);

    return {
      paths: codes.map((code) => ({ params: { code } })),
      fallback: 'blocking',
    };
  }) satisfies GetStaticPaths;

  export const getStaticProps = (async (context) => {
    const showFreeDeliveryBanner = await showFreeDeliveryBannerFlag(
      context.params!.code as string,
      bannerFlags,
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
