# `@flags-sdk/next`

The Next.js integration of the [Flags SDK](https://flags-sdk.dev) v5. It gives `flags` the current request of Next.js.

## Setup

```sh
npm install flags @flags-sdk/next
```

Wrap your configuration with `withFlags`:

```ts
// next.config.ts
import { withFlags } from '@flags-sdk/next/plugin';

export default withFlags({});
```

`withFlags` points the alias `flags/framework` to `@flags-sdk/next/binding`. Then a flag gets the request of the App Router from `headers()` and `cookies()`:

```ts
// flags.ts
import { flag } from 'flags';

export const showBanner = flag<boolean>({
  key: 'show-banner',
  decide: ({ cookies }) => cookies.get('beta')?.value === '1',
});
```

```tsx
// app/page.tsx
import { showBanner } from '../flags';

export default async function Page() {
  return (await showBanner()) ? <p>Banner</p> : null;
}
```

- Only Turbopack is supported. A build with webpack throws.
- `withFlags` can also take a configuration function of the phase. Use it as the outer plugin, e.g. `withFlags(withOtherPlugin({}))`.
- In the Pages Router and in routing middleware, pass the request, e.g. `showBanner(request)` or `precompute(flags, request)`.
- A flag inside `"use cache"` fails with a clear error: evaluate it outside of the cached function, and pass the value in.

## Flags Explorer

`createFlagsDiscoveryEndpoint` creates the endpoint `/.well-known/vercel/flags`:

```ts
// app/.well-known/vercel/flags/route.ts
import { createFlagsDiscoveryEndpoint } from '@flags-sdk/next';
import { getProviderData } from 'flags';
import * as flags from '../../../../flags';

export const GET = createFlagsDiscoveryEndpoint(() => getProviderData(flags));
```
