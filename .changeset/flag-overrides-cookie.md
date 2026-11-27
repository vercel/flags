---
'flags': minor
---

Read the overrides also from the cookie `flag-overrides`, the cookie of the standard. The SDK still reads `vercel-flag-overrides`, the cookie of v4. If both are set, `flag-overrides` wins, and the overrides of the two cookies are not merged.
