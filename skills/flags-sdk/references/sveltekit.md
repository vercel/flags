# SvelteKit Integration

## Table of Contents

- [Quickstart](#quickstart)
- [Toolbar Setup](#toolbar-setup)
- [Flag Declaration](#flag-declaration)
- [Evaluation Context](#evaluation-context)
- [Precompute](#precompute)
- [Dashboard Pages](#dashboard-pages)
- [Marketing Pages](#marketing-pages)

## Quickstart

### Installation

```sh
npm i flags @vercel/toolbar
```

### Create a flag

```ts
// src/lib/flags.ts
import { flag } from 'flags/sveltekit';

export const showDashboard = flag<boolean>({
  key: 'showDashboard',
  description: 'Show the dashboard',
  origin: 'https://example.com/#showdashboard',
  options: [{ value: true }, { value: false }],
  decide(_event) {
    return false;
  },
});
```

### Set up the server hook

One-time setup that makes the toolbar aware of your flags:

```ts
// src/hooks.server.ts
import { createHandle } from 'flags/sveltekit';
import { FLAGS_SECRET } from '$env/static/private';
import * as flags from '$lib/flags';

export const handle = createHandle({ secret: FLAGS_SECRET, flags });
```

When composing with other handlers via SvelteKit's `sequence`, `createHandle` must come first.

### Use the flag

```ts
// src/routes/+page.server.ts
import { showDashboard } from '$lib/flags';

export const load = async () => {
  const dashboard = await showDashboard();
  return {
    post: { title: dashboard ? 'New Dashboard' : 'Old Dashboard' },
  };
};
```

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<h1>{data.post.title}</h1>
```

## Toolbar Setup

1. Install `@vercel/toolbar`
2. Add vite plugin:

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { vercelToolbar } from '@vercel/toolbar/plugins/vite';

export default defineConfig({
  plugins: [sveltekit(), vercelToolbar()],
});
```

3. Render toolbar in layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { LayoutProps } from './$types';
  import { mountVercelToolbar } from '@vercel/toolbar/vite';
  import { onMount } from 'svelte';

  onMount(() => mountVercelToolbar());

  let { children }: LayoutProps = $props();
</script>

<main>
  {@render children()}
</main>
```

## Flag Declaration

```ts
import { flag } from 'flags/sveltekit';

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
import { flag } from 'flags/sveltekit';

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

Extract `identify` as a named function and reuse across flags. Calls are deduped by function identity:

```ts
import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import { flag } from 'flags/sveltekit';

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
    cookies.get('visitorId')?.value ?? headers.get('x-visitorId');
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

### Why both Routing Middleware and reroute

- `middleware.ts` handles full page visits in production (runs before CDN)
- `reroute` handles client-side navigations and dev-time routing
- Middleware has access to cookies and private env vars; `reroute` runs on client and must defer to server

### Step 1: Create flag group

```ts
// src/lib/flags.ts
import { flag } from 'flags/sveltekit';

export const firstPricingABTest = flag({
  key: 'firstPricingABTest',
  decide: () => false,
});

export const secondPricingABTest = flag({
  key: 'secondPricingABTest',
  decide: () => false,
});
```

```ts
// src/lib/precomputed-flags.ts
import { precompute } from 'flags/sveltekit';
import { firstPricingABTest, secondPricingABTest } from './flags';

export const pricingFlags = [firstPricingABTest, secondPricingABTest];

export async function computeInternalRoute(pathname: string, request: Request) {
  if (pathname === '/pricing') {
    return '/pricing/' + (await precompute(pricingFlags, request));
  }
  return pathname;
}
```

### Step 2: Set up reroute hook

```ts
// src/hooks.ts
export async function reroute({ url, fetch }) {
  if (url.pathname === '/pricing') {
    const destination = new URL('/api/reroute', url);
    destination.searchParams.set('pathname', url.pathname);
    return fetch(destination).then((response) => response.text());
  }
}
```

```ts
// src/routes/api/reroute/+server.ts
import { text } from '@sveltejs/kit';
import { computeInternalRoute } from '$lib/precomputed-flags';

export async function GET({ url, request }) {
  const destination = await computeInternalRoute(
    url.searchParams.get('pathname')!,
    request,
  );
  return text(destination);
}
```

### Step 3: Set up middleware

```ts
// middleware.ts
import { rewrite } from '@vercel/edge';
import { normalizeUrl } from '@sveltejs/kit';
import { computeInternalRoute } from './src/lib/precomputed-flags';

export const config = { matcher: ['/pricing'] };

export default async function middleware(request: Request) {
  const { url, denormalize } = normalizeUrl(request.url);
  if (url.pathname === '/pricing') {
    return rewrite(
      denormalize(await computeInternalRoute(url.pathname, request)),
    );
  }
}
```

### Step 4: Read precomputed values

```ts
// src/routes/pricing/[code]/+page.server.ts
import type { PageServerLoad } from './$types';
import { firstPricingABTest, secondPricingABTest } from '$lib/flags';
import { pricingFlags } from '$lib/precomputed-flags';

export const load: PageServerLoad = async ({ params }) => {
  const flag1 = await firstPricingABTest(params.code, pricingFlags);
  const flag2 = await secondPricingABTest(params.code, pricingFlags);
  return {
    first: `First: ${flag1}`,
    second: `Second: ${flag2}`,
  };
};
```

```svelte
<!-- src/routes/pricing/[code]/+page.svelte -->
<script>
  let { data } = $props();
</script>

<p>{data.first}</p>
<p>{data.second}</p>
```

### Enable ISR

```ts
// src/routes/pricing/[code]/+page.server.ts
export const config = {
  isr: { expiration: false },
};
```

### Enable prerendering

```ts
import { generatePermutations } from 'flags/sveltekit';
import { pricingFlags } from '$lib/precomputed-flags';

export const prerender = true;

export async function entries() {
  return (await generatePermutations(pricingFlags)).map((code) => ({ code }));
}
```

## Dashboard Pages

```ts
// src/lib/flags.ts
import { flag } from 'flags/sveltekit';

export const showNewDashboard = flag<boolean>({
  key: 'showNewDashboard',
  decide({ cookies }) {
    return cookies.get('showNewDashboard')?.value === 'true';
  },
});
```

```ts
// src/routes/+page.server.ts
import type { PageServerLoad } from './$types';
import { showNewDashboard } from '$lib/flags';

export const load: PageServerLoad = async () => {
  const dashboard = await showNewDashboard();
  return { title: dashboard ? 'New Dashboard' : 'Old Dashboard' };
};
```

## Marketing Pages

Combine precompute with visitor ID generation for A/B tests on static pages:

### Middleware with visitor ID

```ts
// middleware.ts
import { rewrite } from '@vercel/edge';
import { parse } from 'cookie';
import { normalizeUrl } from '@sveltejs/kit';
import { computeInternalRoute, createVisitorId } from './src/lib/precomputed-flags';

export const config = { matcher: ['/examples/marketing-pages'] };

export default async function middleware(request: Request) {
  const { url, denormalize } = normalizeUrl(request.url);

  let visitorId = parse(request.headers.get('cookie') ?? '').visitorId || '';
  if (!visitorId) {
    visitorId = createVisitorId();
    request.headers.set('x-visitorId', visitorId);
  }

  return rewrite(
    denormalize(await computeInternalRoute(url.pathname, request)),
  );
}
```

### Flags with identify

```ts
// src/lib/flags.ts
import { flag } from 'flags/sveltekit';

interface Entities {
  visitorId?: string;
}

function identify({ cookies, headers }) {
  const visitorId =
    cookies.get('visitorId')?.value ?? headers.get('x-visitorId');
  if (!visitorId) throw new Error('Visitor ID not found');
  return { visitorId };
}

export const firstMarketingABTest = flag<boolean, Entities>({
  key: 'firstMarketingABTest',
  identify,
  decide({ entities }) {
    if (!entities?.visitorId) return false;
    return /^[a-n0-5]/i.test(entities.visitorId);
  },
});
```

The `x-visitorId` header ensures the visitor ID is available even on the first request before the cookie is set.
