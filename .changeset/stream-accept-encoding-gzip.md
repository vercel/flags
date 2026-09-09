---
'@vercel/flags-core': patch
---

Request an uncompressed `/v1/stream` body when running on Bun.

Bun's `fetch` negotiates brotli or gzip by default, but its streaming decoder withholds small decoded output until more compressed input arrives. The stream's first datafile is followed by silence until the next ping, so on Bun the initial datafile never surfaced, init timed out, and every flag fell back to its default. Sending `Accept-Encoding: identity` on Bun avoids the decoder entirely; other runtimes are unchanged.
