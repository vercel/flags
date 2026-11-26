---
'flags': patch
---

An encrypted override token which expired no longer overrides a flag, also when the SDK still has it in its cache. The cache of the decrypted token keeps its expiry and checks it on each use, and a new `FLAGS_SECRET` no longer accepts a cached token of the old secret.
