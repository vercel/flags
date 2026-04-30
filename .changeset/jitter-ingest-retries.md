---
'@vercel/flags-core': minor
---

Add jitter to ingest retries and the batch-flush window.

The usage tracker now uses AWS-style "Full Jitter" exponential backoff between
retry attempts (replacing the previous deterministic 100/200ms schedule) and
randomizes the 5s batch-flush window by ±20% to desynchronize concurrent
processes. When all retry attempts are exhausted the SDK now logs a structured
warning so consumers can alert on dropped batches.
