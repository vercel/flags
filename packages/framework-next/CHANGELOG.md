# @flags-sdk/next

## 0.1.0-standard.0

### Minor Changes

- [#563](https://github.com/vercel/flags/pull/563) [`1a4883c`](https://github.com/vercel/flags/commit/1a4883cea8478e22b6e96a11e2b3a2082ce9ba99) Thanks [@github-actions](https://github.com/apps/github-actions)! - Initial release of the framework bindings of the Flags SDK and of the conformance suite for framework bindings.

### Patch Changes

- [#614](https://github.com/vercel/flags/pull/614) [`9d1888d`](https://github.com/vercel/flags/commit/9d1888d77e82cdce570ddb035cfb08d4b86f3472) Thanks [@dferber90](https://github.com/dferber90)! - With Cache Components, `FlagValues` no longer fails the prerender when the values can not be encrypted. The cached encryption returns the error instead of throwing, because Next.js fails a prerender when a `'use cache'` function throws. `FlagValues` writes no element and warns once, as documented. The error is cached for minutes, not for the lifetime of the token.

- [#614](https://github.com/vercel/flags/pull/614) [`9d1888d`](https://github.com/vercel/flags/commit/9d1888d77e82cdce570ddb035cfb08d4b86f3472) Thanks [@dferber90](https://github.com/dferber90)! - The build no longer waits for open connections while it writes `flags-manifest.json`. A provider which connects when its module loads, e.g. LaunchDarkly, kept the process of the manifest alive until its timeout of 60 seconds, and the build failed.

- [#614](https://github.com/vercel/flags/pull/614) [`9d1888d`](https://github.com/vercel/flags/commit/9d1888d77e82cdce570ddb035cfb08d4b86f3472) Thanks [@dferber90](https://github.com/dferber90)! - Finds a cache scope also with the error messages of Next.js 16.4.6, e.g. ``headers()` can't be read inside `"use cache"` ``. Before, a flag in `'use cache'` was evaluated without the request, and its value could be cached.

- [#614](https://github.com/vercel/flags/pull/614) [`9d1888d`](https://github.com/vercel/flags/commit/9d1888d77e82cdce570ddb035cfb08d4b86f3472) Thanks [@dferber90](https://github.com/dferber90)! - Accept a `FLAGS_SECRET` and a `FLAGS_PRECOMPUTE_SECRET` in standard base64 (with `+`, `/` and `=`), as v4 did. jose 6 decodes only base64url, so v5 rejected these secrets, and a page with `FlagValues` failed to build. The bytes stay the same, so the override tokens and precompute codes of v4 stay valid.

- [#612](https://github.com/vercel/flags/pull/612) [`c491455`](https://github.com/vercel/flags/commit/c4914553614063355e10ff54df06430fa5235a5f) Thanks [@dferber90](https://github.com/dferber90)! - `deserialize` and `getPrecomputed` now throw when a precompute code does not match the requested flags group, such as an empty-group code paired with a non-empty group (or the other way around). The `__no_flags__` sentinel is now only accepted when deserializing an empty flags array.
- Updated dependencies [[`2921a96`](https://github.com/vercel/flags/commit/2921a96e8711c9bd738a4e0338908381ddf41927), [`9d1888d`](https://github.com/vercel/flags/commit/9d1888d77e82cdce570ddb035cfb08d4b86f3472), [`9d1888d`](https://github.com/vercel/flags/commit/9d1888d77e82cdce570ddb035cfb08d4b86f3472), [`1207e22`](https://github.com/vercel/flags/commit/1207e2253e355c6c503896cf66857856c706caab)]:
  - flags@4.4.0-standard.0
