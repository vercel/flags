---
"@vercel/flags-core": patch
---

Retry transient datafile fetch failures across polling, build loading, and offline fallback reads. Fetches use up to three attempts within a shared ten-second deadline that includes authentication, backoff, and body parsing. Shutdown also cancels retries during polling initialization.
