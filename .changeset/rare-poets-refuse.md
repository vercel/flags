---
'flags': patch
---

Tracing no longer records Next.js control-flow errors as span errors. Redirects, notFound, and the rejected hanging promises of aborted prerenders (`HANGING_PROMISE_REJECTION`) are re-thrown for the framework to handle, but the flag evaluation span previously reported them via `span.setStatus({ code: 2, message })`, polluting traces with errors like "During prerendering, `connection()` rejects when the prerender is complete" on every aborted runtime prefetch. These spans are now reported as successful (status Ok), since the traced function completed as intended and the error is framework control flow, while genuine evaluation failures keep marking spans as errored.
