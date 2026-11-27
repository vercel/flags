---
'@flags-sdk/sveltekit': minor
---

Add the manifest of the flags. `flags()` serves the manifest of all modules with `'use flags'` at `/.well-known/flags/manifest.json` in `vite dev`, and `vite build` writes it into `.svelte-kit/output/server/flags-manifest.json`.
