---
'@vercel/flags-core': minor
---

Add APIs for reporting flag exposures and override values.

- The `experimental_reportExposures` client option for supplying an exposure
  reporter.
- The `experimental_reportOverride` client method for reporting values set by
  the Flags SDK override cookie.
- The `experimental_exposureLogging` option on `evaluate()` and
  `bulkEvaluate()` for disabling exposure reporting for an individual call.
- Experiment assignment metadata on `EvaluationResult.experiment`.
- The `experimental_EvaluationOptions`,
  `experimental_ExperimentAssignment`, `experimental_Exposure`, and
  `experimental_ReportExposures` types.

These APIs are not supported for general use yet. Do not use them unless
Vercel has explicitly enabled them for you.
