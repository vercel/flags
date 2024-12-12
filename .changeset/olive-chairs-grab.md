---
'@vercel/flags': minor
---

@vercel/flags/next: Export `dedupe` function

`dedupe` is a middleware-friendly version of `React.cache`. It allows ensuring a function only ever runs once for a request.

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
