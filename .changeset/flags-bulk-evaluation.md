---
'flags': minor
---

Add `bulk()` function for evaluating multiple flags in a single call from the `flags/next` entry point.

```tsx
import { bulk } from 'flags/next';
import { flagA, flagB } from '../flags';

// pass a list of flags
const [valueA, valueB] = await bulk([flagA, flagB]);

// pass an object
const { a, b } = await bulk({ a: flagA, b: flagB });
```

Adapters can now opt into batched evaluation by implementing an optional `bulkDecide` method and setting a stable `adapterId`. When both are present, `bulk()` groups flags that share the same `adapterId` and `identify` source and invokes `bulkDecide` once per group instead of calling `decide` per flag. Flags without a bulk-capable adapter (or with an inline `decide`) still resolve through the normal per-flag path inside `bulk()` and benefit from the shared per-request headers, cookies, and overrides reads.
