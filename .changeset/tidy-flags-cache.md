---
"@vercel/flags-core": minor
---

Add `staleIfError` in seconds to bound cached runtime reads after the first consecutive stream/poll failure or stream disconnect. The default `Infinity` preserves unlimited fallback; finite nonnegative durations (including fractional seconds) use existing evaluation defaults and errors after expiry, and `getDatafile()` follows the same allowance. Accepted updates, valid equal-version responses, or matching stream primed revisions reset the allowance. Storing fallback data does not confirm freshness or renew the failure clock. Build/offline behavior and source scheduling remain unchanged.
