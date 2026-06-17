---
'@flags-sdk/edge-config': minor
---

Simplify usage of the Edge Config adapter

You can now pass the adapter by reference instead of calling it:

```ts
import { edgeConfigAdapter } from '@flags-sdk/edge-config';

// before (still supported)
flag({ key: 'example', adapter: edgeConfigAdapter() });

// now also works
flag({ key: 'example', adapter: edgeConfigAdapter });
```
