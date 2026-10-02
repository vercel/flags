---
"@vercel/flags-core": minor
---

Add `staleIfError` in seconds to bound cached runtime reads after the first consecutive stream/poll failure or stream disconnect. The default `Infinity` preserves unlimited fallback; finite nonnegative durations (including fractional seconds) use existing evaluation defaults and errors after expiry, and `getDatafile()` follows the same allowance. Any successful source response resets the allowance, including one the version guard rejects as older or for a different project, as does a matching stream primed revision. Storing provided or bundled fallback data does not confirm freshness or renew the failure clock. Build/offline behavior and source scheduling remain unchanged.
