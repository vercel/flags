---
'@flags-sdk/openfeature': patch
---

Retry initialization after a failed attempt

Previously a rejected `init()` was cached forever, so a single transient failure (e.g. a connect error during a cold start) made every later flag evaluation replay that same error for the rest of the process' lifetime, without ever dialing the provider again.

The rejected attempt is now discarded so the next evaluation retries, while concurrent callers still share a single in-flight attempt. Failures reported by the provider as `PROVIDER_FATAL` — irrecoverable ones such as invalid credentials or configuration — remain cached, since retrying them cannot succeed.
