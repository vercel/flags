---
'@flags-sdk/sveltekit': minor
---

`createHandle` gives the request of the hook to the runtime of the SDK (`runtime.onInvoke`), so that a flag does not need `getRequestEvent()` while the hook handles the request.
