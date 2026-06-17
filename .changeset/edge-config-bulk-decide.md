---
'@flags-sdk/edge-config': minor
---

Simplify usage and improve evaluation of the Edge Config adapter

When multiple flags share the same Edge Config adapter, the SDK now evaluates them in a single batched call instead of one by one.

You can also now pass the adapter by reference instead of calling it:

```ts
import { edgeConfigAdapter } from '@flags-sdk/edge-config';

// before (still supported)
flag({ key: 'example', adapter: edgeConfigAdapter() });

// now also works
flag({ key: 'example', adapter: edgeConfigAdapter });
```
