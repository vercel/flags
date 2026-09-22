---
'@flags-sdk/flagsmith': major
---

Migrate from the Flagsmith JavaScript SDK to `@flagsmith/nodejs`, with remote evaluation as the default for serverless deployments and opt-in local evaluation for long-running servers. This is a breaking change:

- The adapter now requires a Node.js runtime.
- Local evaluation requires a **server-side environment key** (starting with `ser.`). Set `FLAGSMITH_ENVIRONMENT_KEY` to this key when using the default adapter; rename `FLAGSMITH_ENVIRONMENT_ID` to `FLAGSMITH_ENVIRONMENT_KEY`. The old name is no longer supported.
- Custom adapters now accept the server SDK's `FlagsmithConfig`. Rename `environmentID` to `environmentKey` and `api` to `apiUrl`. There is no `environmentID` compatibility alias.
- Browser SDK options such as `cacheFlags`, `state`, and `onChange` are no longer supported. Pass user identity and traits through the flag's `identify` function.
- Remote evaluation remains the default and persists identity traits in Flagsmith. Set `enableLocalEvaluation: true` to opt into local evaluation without API trait persistence. The upstream 9.0.3 SDK can retain omitted traits across local evaluations of identities with overrides.

For example:

```ts
const adapter = createFlagsmithAdapter({
  environmentKey: process.env.FLAGSMITH_ENVIRONMENT_KEY,
  // Opt in on a long-running server; omit for serverless deployments.
  enableLocalEvaluation: true,
  environmentRefreshIntervalSeconds: 60,
});
```

Share one server client per adapter, passing identity and traits as evaluation arguments. Deduplicate evaluation results by request headers and identity/traits instead of sharing a mutable current-user client across requests. Remote evaluation does not initialize or poll an environment document. When local evaluation is enabled, the shared environment document refreshes every 60 seconds by default.

Add `close()` to stop environment polling during shutdown. Existing flag value coercion and per-flag default values are preserved.

Publish both ESM and CommonJS builds to match the adapter's package exports.
