---
"@vercel/flags-core": patch
---

Add detailed client lifecycle, cache freshness, and network diagnostics using the existing `DEBUG=@vercel/flags-core` environment variable. Logs correlate events by client and omit credentials, definitions, and raw errors.
