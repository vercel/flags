---
'flags': minor
'@flags-sdk/next': minor
'@flags-sdk/vite': minor
'@flags-sdk/sveltekit': minor
'@flags-sdk/tanstack-start': minor
'@flags-sdk/nuxt': minor
'@flags-sdk/express': minor
'@flags-sdk/hono': minor
---

`flags/config.ts` and `defineConfig` are replaced by one file for each part of the configuration, in the folder `flags`:

- `flags/config.json`: the static settings, e.g. `"selfSource": false`. The plugins, the CLI and the runtime read it, and an unknown setting is an error. The JSON Schema is `https://flags-sdk.dev/schemas/config.v1.json`.
- `flags/hooks.ts`: the hooks for all flags, as the default export.
- `flags/overrides.ts`: the options of the overrides, as the default export.
- `flags/sources/<source>/hooks.ts`: the hooks of one source, also of a generated source.

The plugin option `disableSelfSource` and the CLI flag `--disable-self-source` are replaced by `"selfSource": false` in `flags/config.json`. A binding builds the configuration with `configFromModules` of `flags/config`.
