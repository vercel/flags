---
'@vercel/flags-core': patch
---

Request `Accept-Encoding: gzip` on the `/v1/stream` connection.

The stream is long-lived NDJSON and the server flushes the compressor after every message. Runtimes such as Bun advertise `br` by default but do not surface partially decoded brotli output until the response ends, so the initial datafile never arrived and every flag fell back to its default after the init timeout. gzip streams correctly on Node, Bun, and browsers.
