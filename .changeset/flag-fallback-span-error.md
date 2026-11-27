---
"flags": patch
---

In Next.js, a flag which falls back to its `defaultValue` now says so on its span. The `flag` span records `method: fallback` instead of `decided`. When the fallback follows an error thrown by `decide`, the span also records `error.type: general` and the status Error with the message of the error, while the flag still resolves to its `defaultValue`. When `bulkDecide` throws, the `batch` span records the error the same way. The `feature_flag.evaluation` log record of such a flag includes `error.type: general` and `feature_flag.result.reason: error`.

Before, these spans had the status Ok and looked like successful decisions, so a failing provider was only visible in the logs.
