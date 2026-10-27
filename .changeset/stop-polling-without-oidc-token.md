---
"@vercel/flags-core": patch
---

Stop polling when no OIDC token is available, like on a 401, so a client without credentials no longer keeps scripts and test files running.
