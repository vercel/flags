---
"@vercel/flags-core": minor
---

Apply shared stale-while-revalidate and stale-if-error behavior to runtime evaluation, bulk evaluation and getDatafile. Keep staleWhileRevalidateMs at 10,000 milliseconds and add staleIfErrorMs (default Infinity) as an additional error fallback window. Finite windows apply to bundled/provided data too; unchanged polls and stream connectivity provide freshness evidence. Share concurrent refresh work, validate request-specific header versions, and preserve static build/offline caches.
