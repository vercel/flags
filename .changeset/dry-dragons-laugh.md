---
"@flags-sdk/vercel": patch
---

Move `@vercel/flags-core` from peerDependency to regular dependency. It is no longer necessary to install `@vercel/flags-core` for the common use case.

If your app does not use `@vercel/flags-core` directly, you can remove it from your dependencies and do not need to make any code changes.

In case your app imports `@vercel/flags-core` directly, you should pass your instance of the Vercel Flags client to avoid having multiple instances.

```ts
import { createClient } from '@vercel/flags-core';
import { createVercelAdapter } from '@flags-sdk/vercel';

const vercelFlagsClient = createClient(process.env.FLAGS);
const vercelAdapter = createVercelAdapter(vercelFlagsClient);

export const exampleFlag = flag({
  key: 'example-flag',
  adapter: vercelAdapter(),
});
```
