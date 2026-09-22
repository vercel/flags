---
"@vercel/flags-core": minor
---

Add `staleIfErrorMs` to bound cached runtime polling evaluations after the first consecutive poll error. The default `Infinity` preserves unlimited fallback; finite nonnegative durations use existing evaluation defaults and errors after expiry. Accepted updates or valid equal-version confirmations reset the allowance. Snapshot reads, streaming, builds, and polling scheduling are unchanged.
