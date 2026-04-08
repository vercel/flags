---
"@vercel/flags-core": patch
---

Stop retrying ingest requests on 401/403 auth errors.

Previously the usage tracker would retry up to 3 times on any non-OK response, including authentication failures. Since auth errors are permanent, retrying them wastes requests. The SDK now returns immediately on 401 or 403 without retrying, matching the fast-fail behavior already used by the stream connection.
