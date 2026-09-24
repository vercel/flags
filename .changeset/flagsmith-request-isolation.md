---
'@flags-sdk/flagsmith': major
---

Replaced the Flagsmith JavaScript SDK with `@flagsmith/nodejs`, adding support for local evaluation and batched flag evaluation through `evaluate()`.

**Breaking changes**

- A Node.js runtime is now required.
- The default adapter reads `FLAGSMITH_ENVIRONMENT_KEY` instead of `FLAGSMITH_ENVIRONMENT_ID`.
- `createFlagsmithAdapter()` now accepts `FlagsmithConfig` from `@flagsmith/nodejs`. Rename `environmentID` to `environmentKey` and `api` to `apiUrl`.
- Browser SDK options, including `cacheFlags`, `state`, and `onChange`, are no longer supported. Supply user identity and traits through the flag's `identify` function.

Remote evaluation remains the default and continues to persist identity traits in Flagsmith. For long-running servers, enable local evaluation with a server-side environment key (starting with `ser.`):

```ts
const adapter = createFlagsmithAdapter({
  environmentKey: process.env.FLAGSMITH_ENVIRONMENT_KEY,
  enableLocalEvaluation: true,
});
```

Local evaluation shares an environment document across requests and refreshes it every 60 seconds. Configure `environmentRefreshIntervalSeconds` to change the interval, and call the new `adapter.close()` method on shutdown to stop polling. Remote evaluation does not download or poll an environment document.

`evaluate()` fetches flags once per batch. Flags with different coercion modes are evaluated in separate batches. Individual flag evaluation, value coercion, and per-flag defaults remain supported.

**Known limitation:** With local evaluation, `@flagsmith/nodejs` 9.0.3 may retain previously supplied traits for identities with overrides, even when later evaluations of the same identity omit those traits.
