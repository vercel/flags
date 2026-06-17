---
'flags': minor
---

Allow passing an adapter factory directly to `flag()`

You can now pass an adapter factory by reference instead of calling it:

```ts
import { vercelAdapter } from '@flags-sdk/vercel';

// before (still supported)
flag({ key: 'example', adapter: vercelAdapter() });

// now also works
flag({ key: 'example', adapter: vercelAdapter });
```

`flag()` resolves the factory once per declaration. Passing an already-constructed
adapter instance continues to work unchanged. Applies to both the Next.js and
SvelteKit entrypoints.
