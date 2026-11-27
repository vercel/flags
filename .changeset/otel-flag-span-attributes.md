---
"flags": patch
---

`flag` spans include the OpenTelemetry semantic convention attribute `feature_flag.key` next to `key`. When the evaluated value matches exactly one option that has a label, the span also includes that label as `feature_flag.result.variant`. Flag values are not added to spans. `batch` spans of bulk evaluations keep their aggregate attributes only.
