---
"@vercel/flags-core": patch
---

Add detailed client lifecycle, cache freshness, and network diagnostics using the existing `DEBUG=@vercel/flags-core` environment variable. A shared global logger emits events without passing logger instances through the client. Every client diagnostic includes the configured `clientName`, including cache, source, and background network activity. Logs omit credentials, definitions, and raw errors.

State changes include their cause; refresh logs distinguish response receipt, cache application, shared work, stream confirmation, and shutdown cancellation. Startup and source logs expose timeout and freshness thresholds, and recovery is logged only when a failure clears.
