---
'flags': patch
---

Remove `@sveltejs/kit` from peer dependencies. It was declared as an optional peer with a `"*"` range, which caused npm to auto-install the newest `@sveltejs/kit` and drag in its transitive `@sveltejs/vite-plugin-svelte` → `vite` peer chain. In non-SvelteKit projects already on Vite 7 (via Vitest, Storybook, etc.) this produced a hard `ERESOLVE` error requiring `npm install --force`. SvelteKit consumers always have `@sveltejs/kit` installed as the framework, so the `flags/sveltekit` entrypoint continues to resolve it from their own tree.
