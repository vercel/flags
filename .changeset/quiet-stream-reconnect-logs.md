---
'@vercel/flags-core': patch
---

Reduce log noise from stream reconnects.

Retryable stream errors are no longer logged on every failed attempt; the
underlying error is now surfaced only once retries are exhausted (via the
existing "Max retry count exceeded" log). The stream/polling initialization
timeout warnings were also reworded to make clear the client keeps connecting
in the background while serving fallback values.
