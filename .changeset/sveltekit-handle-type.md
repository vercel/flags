---
'flags': patch
---

`createHandle` from `flags/sveltekit` now returns a local `Handle` type. SvelteKit 3 moved `Handle` from `@sveltejs/kit` to `@sveltejs/kit/hooks`, so the types of `createHandle` now work with SvelteKit 2 and SvelteKit 3.
