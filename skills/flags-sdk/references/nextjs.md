# Next.js Integration

## Table of Contents

- [Quickstart](#quickstart)
- [App Router](#app-router)
- [Pages Router](#pages-router)
- [Evaluation Context](#evaluation-context)
- [Dedupe](#dedupe)
- [Precompute](#precompute)
- [Dashboard Pages](#dashboard-pages)
- [Marketing Pages](#marketing-pages)
- [Proxy (Middleware)](#proxy-middleware)
- [Suspense Fallbacks](#suspense-fallbacks)

## Quickstart

```sh
npm install flags
```

Declare a flag in `flags.ts`:

```ts
import { flag } from 'flags/next';

export const exampleFlag = flag({
  key: 'example-flag',
  decide() {
    return Math.random() > 0.5;
  },
});
```

## App Router

Call the flag function from any async server component or middleware:

```tsx
// app/page.tsx
import { exampleFlag } from '../flags';

export default async function Page() {
  const example = await exampleFlag();
  return <div>{example ? 'Flag is on' : 'Flag is off'}</div>;
}
```

## Pages Router

Pass `req` to the flag in `getServerSideProps`:

```tsx
// pages/index.tsx
import type { InferGetServerSidePropsType, GetServerSideProps } from 'next';
import { exampleFlag } from '../flags';

export const getServerSideProps = (async ({ req }) => {
  const example = await exampleFlag(req);
  return { props: { example } };
}) satisfies GetServerSideProps<{ example: boolean }>;

export default function Page({
  example,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <div>{example ? 'Flag is on' : 'Flag is off'}</div>;
}
```

## Evaluation Context

Use `identify` to establish who the request is for. The returned entities are passed to `decide`:

```ts
import { flag, dedupe } from 'flags/next';
import type { ReadonlyRequestCookies } from 'flags';

interface Entities {
  user?: { id: string };
}

const identify = dedupe(
  ({ cookies }: { cookies: ReadonlyRequestCookies }): Entities => {
    const userId = cookies.get('user-id')?.value;
    return { user: userId ? { id: userId } : undefined };
  },
);

export const myFlag = flag<boolean, Entities>({
  key: 'my-flag',
  identify,
  decide({ entities }) {
    return entities?.user?.id === 'user1';
  },
});
```

`identify` receives normalized `headers` and `cookies` that work across App Router, Pages Router, and Middleware.

### Custom evaluation context

Override identify at call site (use sparingly):

```ts
await exampleFlag.run({ identify: { user: { id: 'user1' } } });
await exampleFlag.run({ identify: () => ({ user: { id: 'user1' } }) });
```

## Dedupe

Wrap functions in `dedupe` to run them once per request within the same runtime:

```ts
import { dedupe } from 'flags/next';

const identify = dedupe(({ cookies }) => {
  return { user: { id: cookies.get('uid')?.value } };
});
```

Use cases:
- Prevent duplicate `identify` calls across multiple flags
- Generate consistent random IDs for anonymous visitor experiments

Not available in Pages Router.

## Precompute

Keep pages static while using feature flags. Middleware evaluates flags and encodes results into the URL.

### Prerequisites

Set `FLAGS_SECRET` env var (32 random bytes, base64-encoded):

```sh
node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
```

### Step 1: Create flag group

```ts
// flags.ts
import { flag } from 'flags/next';

export const showSummerSale = flag({
  key: 'summer-sale',
  decide: () => false,
});

export const showBanner = flag({
  key: 'banner',
  decide: () => false,
});

export const marketingFlags = [showSummerSale, showBanner] as const;
```

### Step 2: Precompute in middleware

```ts
// proxy.ts
import { type NextRequest, NextResponse } from 'next/server';
import { precompute } from 'flags/next';
import { marketingFlags } from './flags';

export const config = { matcher: ['/'] };

export async function proxy(request: NextRequest) {
  const code = await precompute(marketingFlags);
  const nextUrl = new URL(
    `/${code}${request.nextUrl.pathname}${request.nextUrl.search}`,
    request.url,
  );
  return NextResponse.rewrite(nextUrl, { request });
}
```

### Step 3: Read precomputed values in page

```tsx
// app/[code]/page.tsx
import { marketingFlags, showSummerSale, showBanner } from '../../flags';

type Params = Promise<{ code: string }>;

export default async function Page({ params }: { params: Params }) {
  const { code } = await params;
  const summerSale = await showSummerSale(code, marketingFlags);
  const banner = await showBanner(code, marketingFlags);

  return (
    <div>
      {banner && <p>welcome</p>}
      {summerSale ? <p>summer sale live</p> : <p>summer sale soon</p>}
    </div>
  );
}
```

### Enable ISR

```tsx
// app/[code]/layout.tsx
export async function generateStaticParams() {
  return []; // empty array enables ISR
}

export default async function Layout({ children }) {
  return children;
}
```

### Build-time rendering

```tsx
import { generatePermutations } from 'flags/next';

export async function generateStaticParams() {
  const codes = await generatePermutations(marketingFlags);
  return codes.map((code) => ({ code }));
}
```

### Declaring options

Options enable efficient URL encoding and Flags Explorer display:

```ts
export const greetingFlag = flag<string>({
  key: 'greeting',
  options: ['Hello world', 'Hi', 'Hola'],
  decide: () => 'Hello world',
});
```

Or with labels:

```ts
export const greetingFlag = flag<string>({
  key: 'greeting',
  options: [
    { label: 'Hello world', value: 'Hello world' },
    { label: 'Hi', value: 'Hi' },
  ],
  decide: () => 'Hello world',
});
```

### Multiple groups

Avoid unnecessary permutations by creating separate flag groups per page:

```ts
export const rootFlags = [navigationFlag, bannerFlag];
export const pricingFlags = [discountFlag];
```

File tree:

```
app/[rootCode]/
  page.tsx
  pricing/[pricingCode]/
    page.tsx
```

### Pages Router precompute

```tsx
// pages/[code]/index.tsx
import { generatePermutations } from 'flags/next';

export const getStaticPaths = (async () => {
  const codes = await generatePermutations(marketingFlags);
  return {
    paths: codes.map((code) => ({ params: { code } })),
    fallback: 'blocking',
  };
}) satisfies GetStaticPaths;

export const getStaticProps = (async (context) => {
  if (typeof context.params?.code !== 'string') return { notFound: true };
  const example = await exampleFlag(context.params.code, marketingFlags);
  return { props: { example } };
}) satisfies GetStaticProps<{ example: boolean }>;
```

## Dashboard Pages

For authenticated dashboard pages, use `identify` to read user context from cookies/JWTs:

```ts
import type { ReadonlyRequestCookies } from 'flags';
import { flag, dedupe } from 'flags/next';

interface Entities {
  user?: { id: string };
}

const identify = dedupe(
  ({ cookies }: { cookies: ReadonlyRequestCookies }): Entities => {
    const userId = cookies.get('dashboard-user-id')?.value;
    return { user: userId ? { id: userId } : undefined };
  },
);

export const dashboardFlag = flag<boolean, Entities>({
  key: 'dashboard-flag',
  identify,
  decide({ entities }) {
    if (!entities?.user) return false;
    const allowedUsers = ['user1'];
    return allowedUsers.includes(entities.user.id);
  },
});
```

Usage in a page:

```tsx
export default async function DashboardPage() {
  const dashboard = await dashboardFlag();
  return <div>{dashboard ? 'New Dashboard' : 'Old Dashboard'}</div>;
}
```

## Marketing Pages

For static marketing pages with A/B tests, combine precompute with visitor ID generation:

### Visitor ID in middleware

```ts
// proxy.ts
import { precompute } from 'flags/next';
import { type NextRequest, NextResponse } from 'next/server';
import { marketingFlags } from './flags';
import { getOrGenerateVisitorId } from './get-or-generate-visitor-id';

export async function marketingMiddleware(request: NextRequest) {
  const visitorId = await getOrGenerateVisitorId(
    request.cookies,
    request.headers,
  );

  const code = await precompute(marketingFlags);

  return NextResponse.rewrite(
    new URL(`/examples/marketing-pages/${code}`, request.url),
    {
      headers: {
        'Set-Cookie': `marketing-visitor-id=${visitorId}; Path=/`,
        'x-marketing-visitor-id': visitorId,
      },
    },
  );
}
```

### Deduplicated visitor ID generation

```ts
import { nanoid } from 'nanoid';
import { dedupe } from 'flags/next';
import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';

const generateId = dedupe(async () => nanoid());

export const getOrGenerateVisitorId = async (
  cookies: ReadonlyRequestCookies,
  headers: ReadonlyHeaders,
) => {
  const cookieVisitorId = cookies.get('marketing-visitor-id')?.value;
  if (cookieVisitorId) return cookieVisitorId;

  const headerVisitorId = headers.get('x-marketing-visitor-id');
  if (headerVisitorId) return headerVisitorId;

  return generateId();
};
```

### Flag using visitor ID

```ts
const identify = dedupe(
  async ({ cookies }: { cookies: ReadonlyRequestCookies }): Promise<Entities> => {
    const visitorId = await getOrGenerateVisitorId(cookies);
    return { visitor: visitorId ? { id: visitorId } : undefined };
  },
);

export const marketingAbTest = flag<boolean, Entities>({
  key: 'marketing-ab-test-flag',
  identify,
  decide({ entities }) {
    if (!entities?.visitor) return false;
    return /^[a-n0-5]/i.test(entities.visitor.id);
  },
});
```

## Proxy (Middleware)

Use flags in middleware to rewrite requests to static page variants:

```ts
// proxy.ts
import { type NextRequest, NextResponse } from 'next/server';
import { myFlag } from './flags';

export const config = { matcher: ['/example'] };

export async function proxy(request: NextRequest) {
  const active = await myFlag();
  const variant = active ? 'variant-on' : 'variant-off';
  return NextResponse.rewrite(new URL(`/example/${variant}`, request.url));
}
```

For multiple flags on one page, use the precompute pattern instead.

## Suspense Fallbacks

Combine precomputed flags with Partial Prerendering to serve matching skeletons:

```tsx
function Example() {
  const hasAuth = await hasAuthCookieFlag();

  return (
    <Suspense fallback={hasAuth ? <AuthedSkeleton /> : <UnauthedSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
```

The `hasAuthCookieFlag` checks cookie existence without authenticating. Two shells get prerendered — one for each auth state — served statically with no layout shift.

## Flags Explorer (Next.js)

### App Router

```ts
// app/.well-known/vercel/flags/route.ts
import { getProviderData, createFlagsDiscoveryEndpoint } from 'flags/next';
import * as flags from '../../../../flags';

export const GET = createFlagsDiscoveryEndpoint(async () => {
  return getProviderData(flags);
});
```

### Pages Router

Requires a rewrite in `next.config.js`:

```js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/.well-known/vercel/flags',
        destination: '/api/vercel/flags',
      },
    ];
  },
};
```

```ts
// pages/api/vercel/flags.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAccess } from 'flags';

export async function handler(req: NextApiRequest, res: NextApiResponse) {
  const access = await verifyAccess(req.headers.get('Authorization'));
  if (!access) return res.json(null, { status: 401 });

  const providerData = { /* ... */ };
  return res.status(200).json(providerData);
}
```
