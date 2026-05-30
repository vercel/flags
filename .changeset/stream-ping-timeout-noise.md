---
"@vercel/flags-core": patch
---

Fix stream reconnect path producing noisy `AbortError` spans on instrumented
fetches.

When the ping watchdog fires (no ping received within the timeout), the SDK now
cancels the body reader instead of aborting the fetch signal. The read loop
exits via `{ done: true }` and the fetch span closes cleanly, so APM/error
tracking (e.g. `@vercel/otel/fetch`) no longer reports the expected reconnect
as `AbortError: This operation was aborted`. Reconnect behavior is unchanged.
