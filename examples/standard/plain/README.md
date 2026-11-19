# Demo: the Flags SDK without a framework

A plain Node.js HTTP server. It shows:

- a source (`defineSource`) with an OpenFeature provider, here an in-memory provider
- flags of the source, with a boolean and a string value
- the evaluation context chain: the call side, the flag, and the source
- the lifecycle of the runtime: `onInit`, `onInvoke` for each request, `onShutdown`

```sh
pnpm --filter flags build
pnpm start   # http://localhost:4400, set the cookie user=alice to see the sale
pnpm test
```
