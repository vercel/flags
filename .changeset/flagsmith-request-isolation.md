---
'@flags-sdk/flagsmith': major
---

Migrate from the Flagsmith JavaScript SDK to `@flagsmith/nodejs`, with local evaluation enabled by default. This is a breaking change:

- The adapter now requires a Node.js runtime.
- Local evaluation requires a **server-side environment key** (starting with `ser.`). Set `FLAGSMITH_ENVIRONMENT_KEY` to this key when using the default adapter; rename `FLAGSMITH_ENVIRONMENT_ID` to `FLAGSMITH_ENVIRONMENT_KEY`. The old name is no longer supported.
- Custom adapters now accept the server SDK's `FlagsmithConfig`. Rename `environmentID` to `environmentKey` and `api` to `apiUrl`. There is no `environmentID` compatibility alias.
- Browser SDK options such as `cacheFlags`, `state`, and `onChange` are no longer supported. Pass user identity and traits through the flag's `identify` function.
- Local evaluation uses the traits supplied with the evaluation without persisting them to Flagsmith. Set `enableLocalEvaluation: false` to retain remote evaluation and persisted traits.

For example:

```ts
const adapter = createFlagsmithAdapter({
  environmentKey: process.env.FLAGSMITH_ENVIRONMENT_KEY,
  // Local evaluation is enabled by default.
  environmentRefreshIntervalSeconds: 60,
});
```

Share one server client and environment cache per adapter, passing identity and traits as evaluation arguments. Deduplicate evaluation results by request headers and identity/traits instead of sharing a mutable current-user client across requests. The environment document refreshes every 60 seconds by default.

Add `close()` to stop environment polling during shutdown. Existing flag value coercion and per-flag default values are preserved.

Publish both ESM and CommonJS builds to match the adapter's package exports.
