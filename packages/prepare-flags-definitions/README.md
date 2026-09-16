# `@vercel/prepare-flags-definitions`

A build-time utility for [Vercel Flags](https://vercel.com/docs/flags/vercel-flags) that fetches flag definitions and bundles them into a synthetic `@vercel/flags-definitions` package inside `node_modules`. This allows `@vercel/flags-core` to access flag definitions instantly at runtime, even when the network is unavailable.

This package is used by the Vercel CLI and other build tools. You typically do not need to install it directly.

## Installation

```bash
npm i @vercel/prepare-flags-definitions
```

## Usage

```ts
import { prepareFlagsDefinitions } from '@vercel/prepare-flags-definitions';

const result = await prepareFlagsDefinitions({
  cwd: process.cwd(),
  env: process.env,
  userAgentSuffix: 'my-build-tool/1.0.0',
});

if (result.created) {
  console.log(`Bundled definitions for ${result.entryCount} entries`);
} else {
  console.log(`No definitions created: ${result.reason}`);
}
```

## How It Works

1. Scans environment variables for SDK keys (matching `vf_server_*` or `vf_client_*`)
2. Fetches flag definitions from `flags.vercel.com` for each key
3. Generates an optimized JavaScript module with deduplication and lazy parsing
4. Writes the module to `node_modules/@vercel/flags-definitions/`

At runtime, `@vercel/flags-core` imports this module as a fallback when streaming or polling is unavailable.

## Debugging embedded JSON parsing

Regenerate the embedded definitions using this version of the package, rebuild your app, and set `VERCEL_FLAGS_DEBUG_EMBEDDED_PARSE=1` in the runtime environment. Updating `@vercel/flags-core` alone does not instrument an existing definitions bundle.

The first lookup of each distinct embedded datafile logs:

```text
@vercel/flags-definitions: JSON.parse { durationMs: 0.123, jsonChars: 12345 }
```

The example values are illustrative. `durationMs` uses `performance.now()` immediately around `JSON.parse`, excluding module import, authentication lookup, and logging. `jsonChars` is the input string length in UTF-16 code units, not a byte count. No SDK keys or flag contents are logged.

Parsing remains lazy and memoized: cache hits, missing entries, and additional keys sharing the same datafile do not produce another timing log. Timing and logging are disabled unless the environment variable is exactly `1`. Logging itself can increase overall initialization time, so compare the reported parse duration separately from total init time.

## Documentation

- [Embedded Definitions](https://vercel.com/docs/flags/vercel-flags/sdks/core#embedded-definitions)
- [Vercel Flags](https://vercel.com/docs/flags/vercel-flags)
