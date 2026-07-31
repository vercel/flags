---
"flags": patch
---

Replace `cache-control: no-store` on the flags discovery endpoint with a self-handled conditional request (ETag / If-None-Match). This allows clients to send `304 Not Modified` requests while guaranteeing the `x-flags-sdk-version` header is always present, since the SDK generates the 304 response itself instead of relying on an upstream cache.
