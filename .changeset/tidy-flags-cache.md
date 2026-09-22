---
"@vercel/flags-core": minor
---

Add `staleIfErrorMs` to bound cached runtime streaming and polling evaluations after the first consecutive source failure. The default `Infinity` preserves unlimited fallback; finite nonnegative durations use existing evaluation defaults and errors after expiry. Accepted updates or matching version/revision confirmations reset the allowance. Snapshot reads, builds, offline behavior, and source scheduling are unchanged.
