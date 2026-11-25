---
'@vercel/flags-core': patch
---

`VercelProvider` of `@vercel/flags-core/openfeature` no longer imports `@openfeature/server-sdk` at runtime: it uses the string values of the resolution reasons and the error codes. An application which uses the provider with the Flags SDK does not need to install `@openfeature/server-sdk`. The types still come from it, so the provider stays an exact OpenFeature `Provider`, e.g. for `OpenFeature.setProvider()`. With `"skipLibCheck": false`, install `@openfeature/server-sdk` as a dev dependency for the types.
