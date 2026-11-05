---
"flags": minor
---

`verifyAccess` accepts short-lived tokens which Vercel signs with Vercel KMS, so the Flags Discovery Endpoint (`/.well-known/vercel/flags`) works on Vercel without a `FLAGS_SECRET`. These tokens are signed by a separate Vercel KMS issuer, not the issuer of signed overrides.

Proofs encrypted with the `FLAGS_SECRET` keep working exactly as before. Without a secret, `verifyAccess` now returns `false` for such a proof instead of throwing.
