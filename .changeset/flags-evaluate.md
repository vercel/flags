---
'flags': minor
---

Extend `evaluate()` from the `flags/next` entry point to resolve multiple flags in a single call.

```tsx
import { evaluate } from 'flags/next';
import { flagA, flagB } from '../flags';

// pass a list of flags
const [valueA, valueB] = await evaluate([flagA, flagB]);

// pass an object
const { a, b } = await evaluate({ a: flagA, b: flagB });
```

Adapters can now opt into batched evaluation by implementing an optional `bulkDecide` method and setting a stable `adapterId`. When both are present, `evaluate()` groups flags that share the same `adapterId` and `identify` source and invokes `bulkDecide` once per group instead of calling `decide` per flag. Flags without a bulk-capable adapter (or with an inline `decide`) still resolve through the normal per-flag path inside `evaluate()` and benefit from the shared per-request headers, cookies, and overrides reads.
