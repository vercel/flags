---
'flags': patch
'@flags-sdk/next': patch
---

Accept a `FLAGS_SECRET` and a `FLAGS_PRECOMPUTE_SECRET` in standard base64 (with `+`, `/` and `=`), as v4 did. jose 6 decodes only base64url, so v5 rejected these secrets, and a page with `FlagValues` failed to build. The bytes stay the same, so the override tokens and precompute codes of v4 stay valid.
