---
"flags": patch
---

Throw on declaration if flag is missing decide function.

When a feature flag is declared without a decide function, or with an adapter that is missing a decide function we will now throw an error at declaration time.
