---
'@vercel/flags-core': patch
---

Fix datafile serialization across the RSC server/client boundary.

Evaluation memoized scaled split weights and compiled regexes by attaching
symbol-keyed properties directly onto objects inside the datafile. While
symbols are invisible to `JSON.stringify`, React Server Components serialization
walks objects directly and chokes on these (notably the non-serializable
`RegExp`), so datafiles could no longer be passed from server to client
components. Memoization now uses module-level `WeakMap`s keyed by the
outcome/rhs objects, leaving datafile objects pristine while keeping identical
caching semantics and lifetime.
