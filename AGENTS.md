# Coding Style

- Always use curly braces for `if`, `else`, loop, and other control-flow bodies in newly added code, including single-statement bodies. Do not refactor existing code solely to add braces.
- Avoid nested ternary expressions. Prefer explicit conditionals or small helper functions so each branch is easy to follow.

# Repository

pnpm (10.19) + Turborepo monorepo of the Flags SDK. Node `^22.11 || ^24 || >=26`.

The `standard` branch holds the Flags SDK v5 rewrite ("one standard for every framework"). Its spec is `packages/flags/SPEC.md`, the normative rules are `packages/flags/STANDARD.md`, and the guide for framework authors is `packages/flags/FRAMEWORK-AUTHORS.md`. Read the relevant section of `SPEC.md` before changing v5 behavior, and update it in the same change.

## Layout

| Path | Contents |
| --- | --- |
| `packages/flags` | The main SDK, published as `flags` (not `@vercel/flags`, which is the old name). Exports `flags`, `flags/runtime`, `flags/explorer`, `flags/manifest`, `flags/tooling`, `flags/config`, `flags/settings`, `flags/hooks`, `flags/framework` and the `flags` CLI. |
| `packages/framework-*` | One package per framework: `@flags-sdk/next`, `vite`, `sveltekit`, `nuxt`, `tanstack-start`, `hono`, `express`. They use only the public API of `flags`. |
| `packages/adapter-*` | Provider adapters, published as `@flags-sdk/<name>`. |
| `packages/vercel-flags-core` | `@vercel/flags-core` (keeps the `@vercel` scope): the Vercel Flags evaluation engine and `VercelProvider`. It has its own `CLAUDE.md`. |
| `packages/conformance`, `packages/prepare-flags-definitions` | Conformance tests for the standard; the build step that embeds flag definitions. |
| `apps/docs` | flags-sdk.dev (Geistdocs). Follow `apps/docs/AGENTS.md`. |
| `apps/playground`, `apps/shirt-shop-api` | Next.js apps. |
| `examples/` | `standard/*` (v5 examples), `providers/*` (one per provider), `playgrounds/*`, `shirt-shop`, `snippets`, `sveltekit-example`. |
| `tests/standard/*` | v5 integration apps per framework (next, next-cache-components, sveltekit, nuxt, tanstack-start, hono, express). `tests/` also has the older e2e apps. |
| `skills/` | Agent skills `flags-sdk` and `vercel-flags`. Keep them in line with the API when it changes (`pnpm validate-skills`). |

## Commands

- From the root: `pnpm build` (packages only), `pnpm test`, `pnpm type-check`, `pnpm check` (biome), `pnpm format`.
- One workspace: `pnpm <script> -F <name>`, for example `pnpm dev -F playground`.
- `packages/flags`: `pnpm test`, `pnpm type-check`, and `pnpm test:playground`. `src/playground.test.ts` walks through the v5 features by group. When you add or change a feature, update the walkthrough in the same change.
- Apps and tests use the `dist` output of the workspace packages. Run `pnpm build` (or `turbo build --filter=<pkg>`) after you change a package and before you run an app against it.

## Conventions

- Formatting and lint: Biome (`biome.json`). It uses single quotes in TS but double quotes in CSS. Run `pnpm exec biome check --write <files>` on the files you changed.
- Commits: the husky pre-commit hook runs `biome check` through lint-staged. Never run `lint-staged` by hand. If it fails outside a commit, it moves uncommitted changes into a "lint-staged automatic backup" stash. Make biome clean before you commit. After each commit, check `git show --stat HEAD`.
- Commit subjects use a scope prefix: `[flags] ...`, `[docs] ...`, `[flags-core] ...`, `[skills] ...`.
- New workspace apps go in `apps/*` or `examples/*`. The workspace already includes them, so `pnpm-workspace.yaml` needs no change. Use the versions the other apps pin: `next` `16.4.6`, `react`/`react-dom` `19.2.4`, `@types/react`/`@types/react-dom` `catalog:`, `tailwindcss` and `@tailwindcss/postcss` `^4.1.17`, `typescript` `^5.9.3`. Use `workspace:*` for SDK packages.
- `next dev` writes and restores a managed "This is NOT the Next.js you know" block in each Next.js app's `AGENTS.md`. Commit it; do not remove it. Before you write Next.js code, read the docs in that app's `node_modules/next/dist/docs/`.
- `minimumReleaseAge` is 2880 minutes (two days) in `pnpm-workspace.yaml`. A newly published third-party version cannot be installed until it is that old. `flags`, `next`, `@next/*`, `@flags-sdk/*` and `@vercel/*` are exempt.
- Docs wording: a flag that is evaluated at request time evaluates "dynamically", not "freshly". Precomputed values are "static".
