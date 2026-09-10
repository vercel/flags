---
'@vercel/flags-core': patch
---

Allow passing a custom `waitUntil` function to `createClient` for background
usage and exposure reporting. Pending exposure reports are drained by
`client.shutdown()`. The Next.js conditional export uses `after` from
`next/server` by default.
