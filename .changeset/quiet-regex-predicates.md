---
"@vercel/flags-core": patch
---

Strip all occurrences of the `g` and `y` flags from regex conditions so cached regular expressions produce consistent results across users and repeated evaluations, including when both flags are present.
