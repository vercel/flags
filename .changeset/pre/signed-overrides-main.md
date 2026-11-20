---
'flags': minor
---

Signed overrides follow the current protocol of the Vercel Toolbar: the scope lists `projectIds` (e.g. all projects of a microfrontends group), and a token can live up to 7 days. On Vercel, the SDK accepts signed overrides also when `FLAGS_SECRET` is set, and reads the OIDC token of the request first. New: `signOverrides(overrides, { ttl })` asks Vercel to sign overrides, e.g. for end-to-end tests without a `FLAGS_SECRET`.
