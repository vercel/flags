---
'@vercel/flags-core': minor
---

`VercelProvider` reports an override of the Flags SDK v5 with the reason `override`, as v4 of the Flags SDK did. The SDK resolves an override without the provider, so a hook of the provider reports it. It also reports the override to `experimental_reportOverride` of the client.
