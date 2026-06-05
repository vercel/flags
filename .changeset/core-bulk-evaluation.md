---
'@vercel/flags-core': minor
---

Add `bulkEvaluate` method to `FlagsClient` for resolving multiple flags against shared entities in a single call.

```ts
const results = await client.bulkEvaluate(
  [
    { key: 'a', defaultValue: false },
    { key: 'b', defaultValue: 'off' },
  ],
  entities,
);

results.a; // EvaluationResult<boolean>
results.b; // EvaluationResult<string>
```

Avoids the per-flag overhead of separate `evaluate()` calls — the datafile is read once, entities are resolved once, and all flags share the same environment/segments lookup. Each entry in the returned record is a full `EvaluationResult` with `value`, `reason`, `outcomeType`, and `metrics`.
