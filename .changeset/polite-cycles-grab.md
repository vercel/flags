---
"flags": patch
---

Improve performance by caching `next/headers` imports.

Previously every flag evaluation in Next.js App Router would run
`await import("next/headers")`. The imported module is cached by
the runtime, but we would still go through the event loop unnecessarily.

Now we cache the resolved module in a local variable so only the
first call awaits the dynamic import; subsequent calls skip the
microtask entirely.
