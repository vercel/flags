---
'flags': minor
---

Introduces a new bulk evaluation method for adapters, which is used when multiple flags are evaluated together to avoid making individual calls to each adapter.

When applications call `evaluate()` or `precompute()` function from `flags/next` it now defers bulk evaluation to the underlying adapters in case those support it, or otherwise falls back to evaluating each flag individually.

This speeds up evaluation for applications that need to evaluate multiple flags at once, as the runtime needs to handle fewer promises and more work is reused. In testing we have seen a 20x improvement when called with 100 flags.

```tsx
import { evaluate } from 'flags/next';
import { flagA, flagB } from '../flags';

// pass a list of flags
const [valueA, valueB] = await evaluate([flagA, flagB]);

// pass an object
const { a, b } = await evaluate({ a: flagA, b: flagB });
```

Adapters can opt into bulk evaluation by implementing a `bulkDecide` method and setting a stable `adapterId`. When both are present, flag evaluation groups flags that share the same `adapterId` and `identify` source and invokes `bulkDecide` once per group instead of calling `decide` per flag. Flags without a bulk-capable adapter still resolve through the normal per-flag path inside `evaluate()` and still benefit from now reusing the shared per-request headers, cookies, and overrides reads.
