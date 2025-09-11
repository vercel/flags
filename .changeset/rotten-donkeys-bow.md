---
'@flags-sdk/launchdarkly': patch
---

Significantly improve performance by upgrading to `@launchdarkly/vercel-server-sdk` v1.3.34.

This release avoids JSON.stringify and JSON.parse overhead which earlier versions of `@launchdarkly/vercel-server-sdk` had.

See

- https://github.com/launchdarkly/js-core/releases/tag/vercel-server-sdk-v1.3.34
- https://github.com/launchdarkly/js-core/pull/918
