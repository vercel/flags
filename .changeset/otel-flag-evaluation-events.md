---
"flags": minor
---

Add `setLoggerProvider` to emit OpenTelemetry `feature_flag.evaluation` log records for direct and bulk flag evaluations. Install `@opentelemetry/api-logs`, now an optional peer dependency, and pass a `LoggerProvider` to `setLoggerProvider` from `flags`.

Each record includes `feature_flag.key`, and `feature_flag.result.variant` when the value matches exactly one labeled option. Failed evaluations include `error.type: general`. Flag values and evaluation context are not logged.
