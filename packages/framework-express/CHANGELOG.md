# @flags-sdk/express

## 0.1.0-standard.0

### Minor Changes

- [#618](https://github.com/vercel/flags/pull/618) [`472a030`](https://github.com/vercel/flags/commit/472a03016caa60f4f22e8254d64e6130d3288e6c) Thanks [@dferber90](https://github.com/dferber90)! - `flags/config.ts` and `defineConfig` are replaced by one file for each part of the configuration, in the folder `flags`:
  
  - `flags/config.json`: the static settings, e.g. `"selfSource": false` and `"overrides": { "vercel": false }`. The plugins, the CLI and the runtime read it, and an unknown setting is an error. The JSON Schema is `https://flags-sdk.dev/schemas/config.v1.json`.
  - `flags/hooks.ts`: the hooks for all flags, as the default export.
  - `flags/sources/<source>/hooks.ts`: the hooks of one source, also of a generated source.
  
  The plugin option `disableSelfSource` and the CLI flag `--disable-self-source` are replaced by `"selfSource": false` in `flags/config.json`. A binding builds the configuration with `configFromModules` of `flags/config`.
  
  The options of the overrides are the setting `overrides` of `flags/config.json`, also for `runtime.configure({ settings: { overrides } })`. The secret comes only from the environment variable `FLAGS_SECRET`: `overrides.secret` can only be `false`. The option `fetch` of the Vercel overrides is removed; the SDK uses the global `fetch`.

- [#563](https://github.com/vercel/flags/pull/563) [`1a4883c`](https://github.com/vercel/flags/commit/1a4883cea8478e22b6e96a11e2b3a2082ce9ba99) Thanks [@github-actions](https://github.com/apps/github-actions)! - Initial release of the framework bindings of the Flags SDK and of the conformance suite for framework bindings.

### Patch Changes

- [#618](https://github.com/vercel/flags/pull/618) [`472a030`](https://github.com/vercel/flags/commit/472a03016caa60f4f22e8254d64e6130d3288e6c) Thanks [@dferber90](https://github.com/dferber90)! - The main export `flags` contains only what an application needs for its flags: `defineSource`, `defineFlag`, `evaluate`, `track`, `FlagEvaluationError`, `DECIDE_REASON`, `OVERRIDE_REASON` and the types. Two new subpaths contain the rest:
  
  - `flags/runtime`: `runtime`, `registerFlags`, `registerSources` and the types `Config`, `Settings`, `SetupFramework`, `GetRequest`, `LoadConfig`, `Runtime`, `OverridesOptions`, `VercelOverridesOptions` and `PlatformProject`. For framework bindings and for applications without a framework plugin, e.g. with Express, Hono or plain Node.js. All copies of the package share one runtime.
  - `flags/explorer`: the protocol of Flags Explorer. `encryptFlagValues`, `decryptFlagValues`, `serializeFlagValues`, `encryptOverrides`, `decryptOverrides`, `signOverrides`, `OverridesError` and their types.
- Updated dependencies [[`472a030`](https://github.com/vercel/flags/commit/472a03016caa60f4f22e8254d64e6130d3288e6c), [`2921a96`](https://github.com/vercel/flags/commit/2921a96e8711c9bd738a4e0338908381ddf41927), [`5dae2ba`](https://github.com/vercel/flags/commit/5dae2bad8e7b5c4f1099fcca84be54df97ad27e8), [`bb15db5`](https://github.com/vercel/flags/commit/bb15db5294685fd2e6e21a702f98e38ebc1c67b1), [`9d1888d`](https://github.com/vercel/flags/commit/9d1888d77e82cdce570ddb035cfb08d4b86f3472), [`472a030`](https://github.com/vercel/flags/commit/472a03016caa60f4f22e8254d64e6130d3288e6c), [`9d1888d`](https://github.com/vercel/flags/commit/9d1888d77e82cdce570ddb035cfb08d4b86f3472), [`472a030`](https://github.com/vercel/flags/commit/472a03016caa60f4f22e8254d64e6130d3288e6c), [`1207e22`](https://github.com/vercel/flags/commit/1207e2253e355c6c503896cf66857856c706caab), [`472a030`](https://github.com/vercel/flags/commit/472a03016caa60f4f22e8254d64e6130d3288e6c)]:
  - flags@5.0.0-standard.0
