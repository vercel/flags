---
"@vercel/flags-core": minor
---

Add staleIfErrorMs (default Infinity) to keep serving cached definitions for a configurable grace period after the first source failure or stream disconnect. Repeated failures do not extend the grace period, and successful updates or confirmations reset it. Apply the same fallback rule to evaluation, bulk evaluation and getDatafile, including provided/bundled data. Keep header-specific stale-while-revalidate and static build/offline behavior unchanged.
