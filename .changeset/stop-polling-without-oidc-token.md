---
"@vercel/flags-core": patch
---

Fail fast on authentication errors. When the stream gets a 401 or no OIDC token is available, the client no longer falls back to polling, which would fail the same way, and goes straight to revalidating over HTTP on reads. When polling is the primary source, its first auth failure stops it, and a missing OIDC token is no longer retried. A failed OIDC token refresh is still retried. A client without credentials no longer keeps scripts and test files running.
