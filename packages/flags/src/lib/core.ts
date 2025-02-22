/**
 * This file contains the core logic of the Flags SDK, which can be reused
 * by the implementations for different frameworks.
 */

// Steps to evaluate a flag
//
// 1. check if precomputed, and use that if it is
//    -> we don't need to respect overrides here, they were already applied when precomputing
//    -> apply spanAttribute: method = "precomputed"
// 2. call run({ identify, headers, cookies }) <- run never respects percomputed values
// 2.1 use override from cookies if one exists, skip caching
//    -> apply spanAttribute: method = "override"
// 2.2 get entities from identify
// 2.3 create cache key by stringifying entities
// 2.4 use cached value if it exists
//    -> apply spanAttribute: method = "cached"
// 2.5 call decide({ headers, cookies, entities })
//    -> cache promise
//    -> apply spanAttribute: method = "decided"
//    -> apply internalReportValue: reason = "override"
