---
'@flags-sdk/vercel': patch
---

`getProviderData` works before Vercel Flags is activated for a project in local development. When the project has no datafile yet, flags that use OIDC take the project from the `project_id` claim of the `VERCEL_OIDC_TOKEN` of `vercel env pull`, so Flags Explorer no longer fails until the first flag is created. Flags with an SDK key still throw.
