# Dependency versions

Run `pnpm deps:check` to check dependency consistency across all pnpm workspace
packages. The Quality workflow runs the same check on pull requests.

Run `pnpm deps:fix` to align manifests, then `pnpm install` to refresh the lockfile.
Syncpack uses versions already declared in the repository; this command does not
fetch the latest versions from npm. Biome remains responsible for formatting.

The policies live in `.syncpackrc.json`. Next.js (including its ESLint config),
TypeScript, and Node 22 types follow the root manifest. Vite follows `flags`.
React and React DOM are checked together, and other shared dependencies align to
the highest version specifier declared within their group.

The configuration documents compatibility exceptions for the Next.js 15 fixture,
React canary, Node type majors, Tailwind 3 examples, and legacy adapter APIs. To
upgrade the Next.js 15 fixture within 15.x, update its `pinVersion` in the config
and run `pnpm deps:fix`. Do not remove that exception when upgrading other apps.

Peer dependency ranges and security overrides are independent of installed
development versions. Provider templates retain published SDK ranges and inline
React type ranges so they remain installable outside this workspace.
