# TanStack Start Integration

## Table of Contents

- [Quickstart](#quickstart)
- [Toolbar Setup](#toolbar-setup)
- [Flags Explorer Setup](#flags-explorer-setup)
- [Flag Declaration](#flag-declaration)
- [Evaluation Context](#evaluation-context)
- [Precompute](#precompute)
- [Dashboard Pages](#dashboard-pages)
- [Marketing Pages](#marketing-pages)

The `flags/tanstack-start` entrypoint mirrors the other adapters. Key differences from SvelteKit:

- There is **no** `createHandle`/server hook. The Flags Explorer is wired up as a TanStack Start **server route** at `/.well-known/vercel/flags` using `createFlagsDiscoveryEndpoint`.
- Flags evaluate on the server. The request is resolved automatically via TanStack Start's `getRequest()` inside a route loader, server function, or server route. You may also pass a `Request` explicitly: `flag(request)`.
- Wrap evaluation in `createServerFn()` so it works during client-side navigation too.

## Quickstart

### Installation

```sh
pnpm i flags @vercel/toolbar
```

### Create a flag

```ts
// src/flags.ts
import { flag } from 'flags/tanstack-start';

export const showDashboard = flag<boolean>({
  key: 'showDashboard',
  description: 'Show the dashboard',
  origin: 'https://example.com/#showdashboard',
  options: [{ value: true }, { value: false }],
  decide() {
    return false;
  },
});
```

### Use the flag

Flags are evaluated on the server, so wrap evaluation in a server function and call it from a route loader.

```tsx
// src/routes/dashboard.tsx
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { showDashboard } from '../flags';

const getDashboardFlags = createServerFn().handler(async () => {
  return { showDashboard: await showDashboard() };
});

export const Route = createFileRoute('/dashboard')({
  loader: () => getDashboardFlags(),
  component: Dashboard,
});

function Dashboard() {
  const { showDashboard } = Route.useLoaderData();
  return <h1>{showDashboard ? 'New Dashboard' : 'Old Dashboard'}</h1>;
}
```

## Toolbar Setup

1. Install `@vercel/toolbar`
2. Add the Vite plugin:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { vercelToolbar } from '@vercel/toolbar/plugins/vite';

export default defineConfig({
  plugins: [tanstackStart(), viteReact(), vercelToolbar()],
});
```

3. Mount the toolbar in the root route:

```tsx
// src/routes/__root.tsx
import { useEffect } from 'react';
import { mountVercelToolbar } from '@vercel/toolbar/vite';

function RootComponent() {
  useEffect(() => mountVercelToolbar(), []);
  // ...render your app
}
```

## Flags Explorer Setup

Wire up the discovery endpoint as a server route. The `[.]` escapes the leading dot so the directory resolves to `/.well-known/vercel/flags`.

```ts
// src/routes/[.]well-known/vercel/flags.ts
import { createFileRoute } from '@tanstack/react-router';
import {
  createFlagsDiscoveryEndpoint,
  getProviderData,
} from 'flags/tanstack-start';
import * as flags from '../../../flags';

const handler = createFlagsDiscoveryEndpoint(() => getProviderData(flags));

export const Route = createFileRoute('/.well-known/vercel/flags')({
  server: { handlers: { GET: handler } },
});
```

Overrides set by Vercel Toolbar (the `vercel-flag-overrides` cookie) are respected automatically — when present the flag's `decide` is skipped.

## Flag Declaration

```ts
import { flag } from 'flags/tanstack-start';

export const showSummerSale = flag<boolean>({
  key: 'summer-sale',
  async decide() { return false; },
  origin: 'https://example.com/flags/summer-sale/',
  description: 'Show Summer Holiday Sale Banner, 20% off',
  options: [
    { value: false, label: 'Hide' },
    { value: true, label: 'Show' },
  ],
});
```

## Evaluation Context

Use `identify` to segment users. Headers and cookies are normalized:

```ts
import { flag } from 'flags/tanstack-start';

interface Entities {
  user?: { id: string };
}

export const exampleFlag = flag<boolean, Entities>({
  key: 'identify-example-flag',
  identify({ headers, cookies }) {
    const userId = cookies.get('user-id')?.value;
    return { user: userId ? { id: userId } : undefined };
  },
  decide({ entities }) {
    return entities?.user?.id === 'user1';
  },
});
```

### Deduplication

Extract `identify` as a named function and reuse it across flags. Calls are deduped by function identity within a request:

```ts
import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { flag } from 'flags/tanstack-start';

interface Entities {
  visitorId?: string;
}

function identify({
  cookies,
  headers,
}: {
  cookies: ReadonlyRequestCookies;
  headers: ReadonlyHeaders;
}): Entities {
  const visitorId =
    cookies.get('visitorId')?.value ?? headers.get('x-visitor-id');
  return { visitorId };
}

export const flag1 = flag<boolean, Entities>({
  key: 'flag1',
  identify,
  decide({ entities }) { /* ... */ },
});

export const flag2 = flag<boolean, Entities>({
  key: 'flag2',
  identify,
  decide({ entities }) { /* ... */ },
});
```

## Precompute

Precompute keeps pages static by evaluating flags once, encoding their values into a signed code, and routing to a dynamic `$code` segment that reads them back.

### Step 1: Create flag group

```ts
// src/precomputed-flags.ts
import { precompute } from 'flags/tanstack-start';
import { firstMarketingABTest, secondMarketingABTest } from './flags';

export const marketingFlags = [
  firstMarketingABTest,
  secondMarketingABTest,
] as const;

export async function precomputeMarketing(request: Request): Promise<string> {
  return precompute(marketingFlags, request);
}
```

### Step 2: Precompute and route to the code

```tsx
// src/routes/marketing.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { precomputeMarketing } from '../precomputed-flags';

const getMarketingCode = createServerFn().handler(async () => {
  return precomputeMarketing(getRequest());
});

export const Route = createFileRoute('/marketing')({
  loader: async () => {
    const code = await getMarketingCode();
    throw redirect({ to: '/marketing/$code', params: { code } });
  },
  component: () => null,
});
```

### Step 3: Read precomputed values

Calling `flag(code, marketingFlags)` decodes the value without re-running `decide`. The same array must be passed to `precompute` and when reading back.

```tsx
// src/routes/marketing.$code.tsx
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { firstMarketingABTest, secondMarketingABTest } from '../flags';
import { marketingFlags } from '../precomputed-flags';

const getMarketingFlags = createServerFn()
  .validator((code: string) => code)
  .handler(async ({ data: code }) => ({
    first: await firstMarketingABTest(code, marketingFlags),
    second: await secondMarketingABTest(code, marketingFlags),
  }));

export const Route = createFileRoute('/marketing/$code')({
  loader: ({ params }) => getMarketingFlags({ data: params.code }),
  component: MarketingPage,
});
```

### Generate permutations

```ts
import { generatePermutations } from 'flags/tanstack-start';
import { marketingFlags } from './precomputed-flags';

const codes = await generatePermutations(marketingFlags);
```

### Routing Middleware (optional)

To rewrite to the precomputed variant before the CDN is hit, run `precompute` inside Vercel Routing Middleware and `rewrite` to `/marketing/${code}`. `precompute` only needs a `Request`, so the same helper is reusable.

## Dashboard Pages

```ts
// src/flags.ts
import { flag } from 'flags/tanstack-start';

export const showNewDashboard = flag<boolean>({
  key: 'showNewDashboard',
  decide({ cookies }) {
    return cookies.get('showNewDashboard')?.value === 'true';
  },
});
```

```tsx
// src/routes/dashboard.tsx
import { createServerFn } from '@tanstack/react-start';
import { showNewDashboard } from '../flags';

const getDashboardFlags = createServerFn().handler(async () => {
  return { showNewDashboard: await showNewDashboard() };
});
```

## Marketing Pages

Combine precompute with a stable visitor id for A/B tests on static pages. The
`identify` function reads the id from a cookie, falling back to an
`x-visitor-id` header (useful when the id is generated in middleware before the
cookie is set):

```ts
// src/flags.ts
import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { flag } from 'flags/tanstack-start';

interface Entities {
  visitorId?: string;
}

function identify({
  cookies,
  headers,
}: {
  cookies: ReadonlyRequestCookies;
  headers: ReadonlyHeaders;
}): Entities {
  const visitorId =
    cookies.get('visitorId')?.value ?? headers.get('x-visitor-id');
  return { visitorId };
}

export const firstMarketingABTest = flag<boolean, Entities>({
  key: 'firstMarketingABTest',
  identify,
  decide({ entities }) {
    if (!entities?.visitorId) return false;
    return /^[a-m0-4]/i.test(entities.visitorId);
  },
});
```

See the full example at `examples/tanstack-start-example`.
