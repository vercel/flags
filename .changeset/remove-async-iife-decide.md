---
"flags": patch
---

Reduce microtask queue overhead in flag evaluation by replacing the async IIFE around `decide()` with a direct call and `Promise.resolve()`.
