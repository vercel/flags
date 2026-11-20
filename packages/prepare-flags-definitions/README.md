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

### Snapshots

Pass `snapshotsDir` to also write each datafile as a JSON file into that directory:

```ts
await prepareFlagsDefinitions({
  cwd: process.cwd(),
  env: process.env,
  snapshotsDir: '.vercel/output/snapshots/vercel-flags',
});
```

Files are named `<key>.json`, where the key is the project ID or the SHA-256 hash of the SDK key, matching the keys of the generated module. Build tools can embed these files into the deployment's functions without depending on `node_modules`.

The datafiles contain your flag configuration, so `snapshotsDir` must be a directory owned by the build that other users cannot read or modify, including its parent directories. A directory inside the project, like `.vercel/output/snapshots/vercel-flags`, meets this. Files are created with mode `0600`, but on Windows they inherit the directory's access control list.

## Documentation

- [Embedded Definitions](https://vercel.com/docs/flags/vercel-flags/sdks/core#embedded-definitions)
- [Vercel Flags](https://vercel.com/docs/flags/vercel-flags)
