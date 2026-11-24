# Precompute (Next.js)

A page that evaluates a flag is dynamic. Precompute keeps it static while visitors see different values:

1. The proxy evaluates the flags of the page for the visitor.
2. It puts their values into a short, signed code, and rewrites the request to a URL with that code.
3. Next.js renders one static page per code, at build time or on the first request.
4. The page reads the values from the code. It does not evaluate the flags again.

The visitor sees the original URL. There is no layout shift. Precompute is in `@flags-sdk/next/precompute`, and needs `withFlags` in `next.config.ts`. It exists for Next.js only.

## 1. Group the flags of the page

Put the group into a module without `'use flags'`, because a `'use flags'` module exports only flags:

```ts
// marketing-flags.ts
import { checkout, summerSale } from 'flags:self';

export const marketingFlags = [summerSale, checkout] as const;
```

Any flag works: inline flags and provider flags, from flags files or hand-written.

## 2. Precompute in the proxy

```ts
// proxy.ts
import { precompute } from '@flags-sdk/next/precompute';
import { type NextRequest, NextResponse } from 'next/server';
import { marketingFlags } from './marketing-flags';

export async function proxy(request: NextRequest) {
  // The request goes to the evaluation context chain and to the overrides
  const code = await precompute(marketingFlags, { request });
  return NextResponse.rewrite(new URL(`/marketing/${code}`, request.url));
}

export const config = { matcher: '/marketing' };
```

`precompute` evaluates the flags inside `runtime.onInvoke(request, ...)`, so `getEvaluationContext`, `decide` and Flags Explorer overrides see the request of the proxy.

## 3. Read the values in the page

```tsx
// app/marketing/[code]/page.tsx
import { generatePermutations, getPrecomputed } from '@flags-sdk/next/precompute';
import { checkout, summerSale } from 'flags:self';
import { marketingFlags } from '../../../marketing-flags';

// Optional: build a page for each combination at build time
export async function generateStaticParams() {
  const codes = await generatePermutations(marketingFlags);
  return codes.map((code) => ({ code }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [sale, flow] = await getPrecomputed(
    [summerSale, checkout],
    marketingFlags,
    code,
  );
  return <h1>{sale ? 'Summer sale' : `Checkout: ${flow}`}</h1>;
}
```

- `getPrecomputed(flag, group, code)` returns one value. `getPrecomputed([a, b], group, code)` returns the values in order.
- `group` must be the same list, in the same order, that `precompute` received.
- A flag that is not part of the group throws.
- Do not call the flag itself on the precomputed page. That evaluates it again and makes the page dynamic.

## Build time or on demand

- **Build time**: `generatePermutations(group)` returns the code of each combination. Booleans have `false` and `true`. Every other flag needs `options`, or it throws. Skip combinations with a filter: `generatePermutations(marketingFlags, (values) => values.summerSale === true)`.
- **On demand (ISR)**: return `[]` from `generateStaticParams`. Next.js renders each combination on its first request and caches it. Use this when there are many combinations.
- A provider can return a value outside `options`, e.g. a new variant. The code then carries the value itself, and Next.js renders that page on demand, unless `export const dynamicParams = false`.

## The secret

The code is signed, so a visitor cannot pick values by editing the URL.

- `withFlags` puts a random secret per build into the server code. No configuration is needed.
- Set `FLAGS_PRECOMPUTE_SECRET` (for the build and the runtime) when codes must stay valid across deployments. It is not `FLAGS_SECRET`.
- Without `withFlags`, set `FLAGS_PRECOMPUTE_SECRET`, or precompute throws.
- Each function also accepts an explicit `secret`.
- Secret order: the `secret` argument, `FLAGS_PRECOMPUTE_SECRET`, the build secret.

## Several groups

Precompute only the flags that each part of the app needs. Each extra flag doubles the number of combinations or more. Use one group for the whole app and another for one page, e.g. `app/[rootCode]/pricing/[pricingCode]/page.tsx`. Call `precompute` for each group in the proxy, and put each code into its segment of the rewrite.

## Identify visitors in the proxy

A static page cannot set cookies. The proxy creates the visitor ID, passes it to the flags, and sets the cookie:

```ts
// proxy.ts
import { precompute } from '@flags-sdk/next/precompute';
import { type NextRequest, NextResponse } from 'next/server';
import { marketingFlags } from './marketing-flags';

export async function proxy(request: NextRequest) {
  const visitorId =
    request.cookies.get('visitor-id')?.value ?? crypto.randomUUID();

  // The first input of the evaluation context chain, for each flag
  const code = await precompute(marketingFlags, {
    request,
    evaluationContext: { visitorId },
  });

  const response = NextResponse.rewrite(
    new URL(`/marketing/${code}`, request.url),
  );
  response.cookies.set('visitor-id', visitorId, { path: '/' });
  return response;
}

export const config = { matcher: '/marketing' };
```

The source uses the ID as the targeting key. The input is optional, so the flags also work outside the proxy:

```ts
// marketing.ts
'use flags';

import { VercelProvider } from '@vercel/flags-core/openfeature';
import { defineSource } from 'flags';

const marketing = defineSource({
  provider: new VercelProvider(),
  project: { system: 'vercel-flags' },
  getEvaluationContext: (
    request,
    input: { visitorId?: string } | undefined,
  ) => ({
    targetingKey:
      input?.visitorId ??
      request?.cookies?.get('visitor-id')?.value ??
      'anonymous',
  }),
});

export const heroTest = marketing.bindFlag('heroTest', {
  defaultValue: false,
});
```

With flags files, the same logic goes into `context.ts` of the source, with the typed optional second parameter.

## Suspense fallbacks

Precomputed values are known in the static shell, so they can pick a skeleton:

```tsx
// app/[code]/page.tsx (fragment)
const signedIn = await getPrecomputed(hasAuthCookie, rootFlags, code);

return (
  <Suspense fallback={signedIn ? <DashboardSkeleton /> : <SignInSkeleton />}>
    <Dashboard />
  </Suspense>
);
```

## Flag values in Flags Explorer

Pass the precomputed values with `values`. `FlagValues` then does not read the request, and the page stays static:

```tsx
import { FlagValues } from '@flags-sdk/next/flag-values';

<FlagValues values={{ [summerSale.key]: sale, [checkout.key]: flow }} />
```

## Lower-level functions

- `serialize(flags, values, secret?)`: a signed code from values, without evaluating.
- `deserialize(flags, code, secret?)`: all values of a code, by key.
- `combine(flags, values)`: the values as a record, by key.

## Upgrading from v4

The API and the code format are the same, and a v4 code is valid in v5.

- A flag is no longer a function of `(code, group)`. Use `getPrecomputed(flag, group, code)`.
- Import from `@flags-sdk/next/precompute`, not `flags/next`.
- A flag that is not part of the code throws.
- A non-boolean flag without `options` throws in `generatePermutations`.
- To keep v4 codes valid during the upgrade, set `FLAGS_PRECOMPUTE_SECRET` to the old `FLAGS_SECRET`.

Example app: `examples/shirt-shop` (precompute with Cache Components and a stable ID).
