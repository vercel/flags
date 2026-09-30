---
"@vercel/flags-core": patch
---

Add detailed client lifecycle, cache freshness, and network diagnostics using the existing `DEBUG=@vercel/flags-core` environment variable. A shared global logger emits events without passing logger instances through the client. Logs omit credentials, definitions, and raw errors.
