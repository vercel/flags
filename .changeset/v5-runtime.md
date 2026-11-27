---
'flags': minor
---

Add the runtime of the SDK, one for all frameworks. `runtime.onInvoke(request, next)` of the new `flags/runtime` gives the flags of a request its state, for frameworks with a middleware which wraps the handler. A flag gets its request from the call, then from `runtime.onInvoke`, then from the framework binding. Each request has one state: the cache of the flag values, the argument of `identify`, the overrides, and the cache of `dedupe`. The types `FlagsRequest` and `FlagsRequestInit` describe the request.
